-- MathSmart Phase 4 — interventions and reporting, part 2 of 4.
--
-- app.interventions and app.system_settings.
--
-- Groq independence
-- -----------------
-- `ai_insight` and `ai_recommendation` are nullable and carry no constraint
-- that any other column depends on. A case is complete, valid and actionable
-- with both of them NULL, which is what "Groq is advisory" has to mean at the
-- storage layer: if Groq is disabled, times out or fails, nothing here becomes
-- invalid and no lifecycle transition is blocked. Severity, status, type,
-- evidence and the educator's own notes are the authoritative fields.

-- ---------------------------------------------------------------------------
-- app.interventions
-- ---------------------------------------------------------------------------
create table app.interventions (
  intervention_id uuid primary key default gen_random_uuid(),
  student_id uuid not null
    references app.student_profiles (student_id)
    on update cascade
    on delete restrict,
  -- The educator who owns the case. Auditable, and never removed while a case
  -- still points at them.
  teacher_admin_id uuid not null
    references app.teacher_admin_profiles (teacher_admin_id)
    on update cascade
    on delete restrict,
  competency_id uuid not null
    references app.competencies (competency_id)
    on update cascade
    on delete restrict,

  severity app.intervention_severity not null,
  status app.intervention_status not null default 'Needs Intervention',
  intervention_type app.intervention_type not null,

  -- Deterministic evidence gathered from the learner's own records.
  incorrect_patterns jsonb not null default '[]'::jsonb,
  modules_attempted jsonb not null default '[]'::jsonb,

  -- Advisory only. Optional, and nothing depends on them.
  ai_insight text,
  ai_recommendation text,

  educator_notes text,

  created_at timestamptz not null default now(),
  recorded_at timestamptz not null default now(),
  resolved_at timestamptz,
  -- Cases are archived rather than deleted, so the audit trail survives. The
  -- frozen ERD has no field for this, but the documented archive operation on
  -- the interventions endpoint needs one.
  archived_at timestamptz,
  updated_at timestamptz not null default now(),

  constraint interventions_incorrect_patterns_is_array
    check (jsonb_typeof(incorrect_patterns) = 'array'),
  constraint interventions_modules_attempted_is_array
    check (jsonb_typeof(modules_attempted) = 'array'),

  constraint interventions_ai_insight_length
    check (ai_insight is null or char_length(ai_insight) <= 4000),
  constraint interventions_ai_recommendation_length
    check (ai_recommendation is null or char_length(ai_recommendation) <= 4000),
  constraint interventions_educator_notes_length
    check (educator_notes is null or char_length(educator_notes) <= 4000),

  -- Lifecycle timestamps. A resolved case records when it was resolved, and an
  -- unresolved one has not been.
  constraint interventions_resolved_matches_status
    check (
      (status = 'Resolved' and resolved_at is not null)
      or (status <> 'Resolved' and resolved_at is null)
    ),
  constraint interventions_recorded_not_before_created
    check (recorded_at >= created_at),
  constraint interventions_resolved_not_before_recorded
    check (resolved_at is null or resolved_at >= recorded_at),
  constraint interventions_archived_not_before_created
    check (archived_at is null or archived_at >= created_at),

  constraint interventions_updated_not_before_created
    check (updated_at >= created_at)
);

comment on table app.interventions is
  'Auditable intervention case linking a learner, the educator who owns it, and the target competency. Remains valid and actionable when Groq returns nothing.';
comment on column app.interventions.ai_insight is
  'Advisory Groq output. Optional, non-authoritative, and never required for a case to be valid or to change status.';
comment on column app.interventions.ai_recommendation is
  'Advisory Groq output. The educator still chooses intervention_type.';
comment on column app.interventions.educator_notes is
  'The authorised educator''s own words. Kept distinct from advisory AI output.';

create index interventions_student_idx on app.interventions (student_id);
create index interventions_teacher_admin_idx on app.interventions (teacher_admin_id);
create index interventions_competency_idx on app.interventions (competency_id);
create index interventions_status_idx on app.interventions (status);
create index interventions_severity_idx on app.interventions (severity);
create index interventions_student_status_idx on app.interventions (student_id, status);
create index interventions_open_queue_idx
  on app.interventions (severity, created_at desc)
  where archived_at is null and status <> 'Resolved';

create trigger interventions_set_updated_at
  before update on app.interventions
  for each row
  execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- app.system_settings
-- ---------------------------------------------------------------------------
-- Safe operational configuration only: thresholds, intervention rules,
-- notification preferences, and Groq feature flags.
--
-- Deployment secrets and the Groq model selection are `.env` values and must
-- never appear here. That is enforced rather than merely documented: the key
-- must sit inside one of four allowed namespaces, and both the key and the
-- stored value are rejected if they look like a credential or a model
-- selection.
create table app.system_settings (
  setting_key text primary key,
  setting_value jsonb not null,
  -- Every change identifies the Teacher/Administrator who made it. The role is
  -- pinned and the composite foreign key can only match a user_profiles row
  -- whose role is teacher_admin, so a learner can never appear here even if a
  -- policy were written carelessly.
  updated_by uuid not null,
  updated_by_role app.user_role not null default 'teacher_admin',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  constraint system_settings_updated_by_role_check
    check (updated_by_role = 'teacher_admin'),
  constraint system_settings_updated_by_fkey
    foreign key (updated_by, updated_by_role)
    references app.user_profiles (user_id, role)
    on update cascade
    on delete restrict,

  constraint system_settings_key_shape
    check (setting_key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  constraint system_settings_key_namespace
    check (split_part(setting_key, '.', 1)
             in ('thresholds', 'intervention', 'notifications', 'features')),

  -- No credential, token or model selection, by key or by value.
  constraint system_settings_key_is_not_a_secret
    check (setting_key !~* '(api[_-]?key|secret|password|token|credential|service[_-]?role|model)'),
  constraint system_settings_value_is_not_a_secret
    check (not app.looks_like_a_secret(setting_value)),

  constraint system_settings_updated_not_before_created
    check (updated_at >= created_at)
);

comment on table app.system_settings is
  'Audited Teacher/Administrator configuration: thresholds, intervention rules, notification preferences and Groq feature flags. Never credentials, and never the Groq model selection, which are deployment-only .env values.';
comment on column app.system_settings.updated_by is
  'The Teacher/Administrator who made the change. Constrained to that role by a composite foreign key.';

create index system_settings_updated_by_idx on app.system_settings (updated_by);

create trigger system_settings_set_updated_at
  before update on app.system_settings
  for each row
  execute function app.set_updated_at();
