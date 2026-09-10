-- MathSmart Phase 5a — API contract addendum, part 1 of 3.
--
-- Why this migration exists
-- -------------------------
-- Phases 1 to 4 built the entity-relationship diagram in the source of truth
-- exactly. The API contract in the frozen route documentation requires several
-- objects that diagram never modelled, and four documented endpoint groups
-- cannot function without them. The two frozen documents disagree; neither was
-- edited. Each object below is created because a specific documented endpoint
-- or rule requires it, and the requirement is quoted in the comment above it.
--
-- Nothing here changes an existing rule. Answer keys stay server-only, learner
-- records stay read-only through the Data API roles, and Groq stays advisory.

-- ---------------------------------------------------------------------------
-- Vocabularies the contract names but the diagram never typed
-- ---------------------------------------------------------------------------
-- The canonical enum table lists `diagnostic_status` with these three values.
-- It is a filter on the learner roster, a field in the learner summary shape,
-- and the whole response of the diagnostic-status endpoint, so it needs to be a
-- real type rather than something recomputed per request.
create type app.diagnostic_status as enum ('not_started', 'in_progress', 'completed');

comment on type app.diagnostic_status is
  'Canonical learner diagnostic progress, from the frozen canonical enum table.';

-- User administration lists and filters accounts "by role/status/search",
-- changes "approved role/status fields", and archives rather than deletes.
-- `monitoring_status` is a learning signal, not an account state, so account
-- state needs its own vocabulary.
create type app.account_status as enum ('active', 'suspended', 'archived');

comment on type app.account_status is
  'Account state for user administration. Distinct from monitoring_status, which describes learning rather than access.';

-- ---------------------------------------------------------------------------
-- app.audit_events
-- ---------------------------------------------------------------------------
-- "Sensitive mutations and exports create an audit record with actor, action,
-- target, timestamp, and request ID." The read side is the audit-events
-- endpoint. Roughly forty documented mutations carry an audit obligation and
-- had nowhere to write it.
--
-- Append-only by construction: no role receives UPDATE or DELETE, not even the
-- backend, so an audit record cannot be altered after the fact.
create table app.audit_events (
  audit_event_id uuid primary key default gen_random_uuid(),
  -- The authenticated actor. Kept even if the account is later archived, so
  -- the FK restricts rather than cascades.
  actor_user_id uuid
    references app.user_profiles (user_id)
    on update cascade
    on delete restrict,
  actor_role app.user_role,
  action text not null,
  target_type text not null,
  target_id uuid,
  request_id text,
  -- Least-data payload: what changed, never the whole record, and never a
  -- credential or an answer key.
  details jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),

  constraint audit_events_action_not_blank
    check (btrim(action) <> ''),
  constraint audit_events_action_shape
    check (action ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  constraint audit_events_target_type_not_blank
    check (btrim(target_type) <> ''),
  constraint audit_events_request_id_length
    check (request_id is null or char_length(request_id) between 1 and 128),
  constraint audit_events_details_is_object
    check (jsonb_typeof(details) = 'object'),
  -- An audit trail must never become the place a secret leaks to.
  constraint audit_events_details_is_not_a_secret
    check (not app.looks_like_a_secret(details))
);

comment on table app.audit_events is
  'Append-only audit trail: actor, action, target, timestamp and request id. No role holds UPDATE or DELETE on it.';
comment on column app.audit_events.details is
  'Least-data description of what changed. Never a credential, never an answer key.';

create index audit_events_actor_idx on app.audit_events (actor_user_id, occurred_at desc);
create index audit_events_target_idx on app.audit_events (target_type, target_id);
create index audit_events_action_idx on app.audit_events (action, occurred_at desc);
create index audit_events_occurred_idx on app.audit_events (occurred_at desc);
create index audit_events_request_idx on app.audit_events (request_id);

-- ---------------------------------------------------------------------------
-- app.idempotency_keys
-- ---------------------------------------------------------------------------
-- "Final assessment and activity submissions require an `Idempotency-Key`
-- header so retries cannot create duplicate attempts." Replaying a key has to
-- return the original response rather than grade twice, which needs the
-- response stored.
create table app.idempotency_keys (
  user_id uuid not null
    references app.user_profiles (user_id)
    on update cascade
    on delete cascade,
  endpoint text not null,
  idempotency_key text not null,
  -- Hash of the request body. A replay with the same key but a different body
  -- is a client defect and must be rejected, not silently answered.
  request_fingerprint text not null,
  response_status integer,
  response_body jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,

  constraint idempotency_keys_pkey primary key (user_id, endpoint, idempotency_key),

  constraint idempotency_keys_key_length
    check (char_length(idempotency_key) between 8 and 255),
  constraint idempotency_keys_endpoint_not_blank
    check (btrim(endpoint) <> ''),
  constraint idempotency_keys_fingerprint_not_blank
    check (btrim(request_fingerprint) <> ''),
  constraint idempotency_keys_response_status_range
    check (response_status is null or response_status between 100 and 599),
  -- A completed record carries the response it is replaying.
  constraint idempotency_keys_completed_is_consistent
    check (
      (completed_at is null and response_status is null and response_body is null)
      or (completed_at is not null and response_status is not null)
    ),
  constraint idempotency_keys_completed_not_before_created
    check (completed_at is null or completed_at >= created_at)
);

comment on table app.idempotency_keys is
  'Replay protection for final submissions. Stores the original response so a retry returns it instead of grading twice.';

create index idempotency_keys_created_idx on app.idempotency_keys (created_at);

-- ---------------------------------------------------------------------------
-- app.activity_responses
-- ---------------------------------------------------------------------------
-- An activity attempt starts before it is submitted, autosaves answers, and
-- answers can be checked one at a time: the answer-check endpoint returns
-- `attempts_for_question`, and starting an attempt returns `saved_answers`.
-- Assessments already have a per-question response table; activities had none,
-- so none of that state could be stored.
create table app.activity_responses (
  response_id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null
    references app.activity_attempts (attempt_id)
    on update cascade
    on delete cascade,
  question_id uuid not null
    references app.questions (question_id)
    on update cascade
    on delete restrict,
  answer jsonb,
  is_correct boolean,
  -- Backs `attempts_for_question` in the answer-check response.
  check_count integer not null default 0,
  -- Backs `hint_available` and the hint endpoint, which must not disclose the
  -- answer and cannot change scoring.
  hint_issued_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint activity_responses_attempt_question_key unique (attempt_id, question_id),
  constraint activity_responses_check_count_not_negative
    check (check_count >= 0),
  constraint activity_responses_updated_not_before_created
    check (updated_at >= created_at)
);

comment on table app.activity_responses is
  'A learner''s answer to one question inside one activity attempt, with the per-question check count the answer-check endpoint reports.';

create index activity_responses_question_idx on app.activity_responses (question_id);

create trigger activity_responses_set_updated_at
  before update on app.activity_responses
  for each row
  execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- app.reassessment_authorizations
-- ---------------------------------------------------------------------------
-- "Authorize a reassessment and record the pedagogical reason", audited, and
-- the named trigger for the documented `412 Precondition Failed` on an
-- unauthorized reassessment. There was nothing to check and nowhere to record
-- the reason.
create table app.reassessment_authorizations (
  authorization_id uuid primary key default gen_random_uuid(),
  student_id uuid not null
    references app.student_profiles (student_id)
    on update cascade
    on delete restrict,
  assessment_id uuid not null
    references app.assessments (assessment_id)
    on update cascade
    on delete restrict,
  -- The educator who granted it, retained for audit.
  authorized_by uuid not null
    references app.teacher_admin_profiles (teacher_admin_id)
    on update cascade
    on delete restrict,
  reason text not null,
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  -- Set when the authorization is spent, together with the attempt that spent
  -- it, so one grant cannot open two reassessments.
  consumed_at timestamptz,
  consumed_attempt_id uuid
    references app.assessment_attempts (attempt_id)
    on update cascade
    on delete set null,
  created_at timestamptz not null default now(),

  constraint reassessment_authorizations_reason_not_blank
    check (btrim(reason) <> ''),
  constraint reassessment_authorizations_reason_length
    check (char_length(reason) between 3 and 1000),
  constraint reassessment_authorizations_expires_after_granted
    check (expires_at is null or expires_at > granted_at),
  constraint reassessment_authorizations_consumed_not_before_granted
    check (consumed_at is null or consumed_at >= granted_at),
  constraint reassessment_authorizations_consumed_is_consistent
    check (
      (consumed_at is null and consumed_attempt_id is null)
      or (consumed_at is not null and consumed_attempt_id is not null)
    )
);

comment on table app.reassessment_authorizations is
  'An educator''s audited grant allowing one further attempt at an assessment, with the pedagogical reason. Spent once.';

-- At most one unspent authorization per learner and assessment, so repeated
-- granting cannot stockpile retries.
create unique index reassessment_authorizations_one_open_key
  on app.reassessment_authorizations (student_id, assessment_id)
  where consumed_at is null;

create index reassessment_authorizations_student_idx
  on app.reassessment_authorizations (student_id, assessment_id);
create index reassessment_authorizations_authorized_by_idx
  on app.reassessment_authorizations (authorized_by);
