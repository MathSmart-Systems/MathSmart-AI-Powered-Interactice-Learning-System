-- MathSmart Phase 4 — interventions and reporting, part 3 of 4.
--
-- Privileges and Row Level Security for app.interventions and
-- app.system_settings.
--
-- Both tables are Teacher/Administrator territory. The documented role matrix
-- gives learners no access to intervention management and no access to global
-- configuration, so learners receive no rows from either table rather than a
-- reduced column set: the safest subset of intervention information to expose
-- to a learner is none of it, and the aggregate a learner's own dashboard needs
-- comes from the reporting views, which return zero for them.
--
-- Cases are archived through `archived_at`, never deleted, so the audit trail
-- survives. No DELETE is granted to any Data API role on either table.

alter table app.interventions    enable row level security;
alter table app.system_settings  enable row level security;

revoke all on app.interventions   from public, anon, authenticated;
revoke all on app.system_settings from public, anon, authenticated;

grant select, insert, update, delete on app.interventions   to service_role;
grant select, insert, update, delete on app.system_settings to service_role;

-- ---------------------------------------------------------------------------
-- app.interventions
-- ---------------------------------------------------------------------------
grant select on app.interventions to authenticated;
-- intervention_id is absent from both column lists, so identifiers stay
-- server-generated.
grant insert (student_id, teacher_admin_id, competency_id, severity, status,
              intervention_type, incorrect_patterns, modules_attempted,
              ai_insight, ai_recommendation, educator_notes,
              recorded_at, resolved_at, archived_at)
  on app.interventions to authenticated;
grant update (severity, status, intervention_type, incorrect_patterns,
              modules_attempted, ai_insight, ai_recommendation, educator_notes,
              recorded_at, resolved_at, archived_at)
  on app.interventions to authenticated;

create policy interventions_select
  on app.interventions
  for select
  to authenticated
  using ((select app.is_teacher_admin()));

create policy interventions_insert
  on app.interventions
  for insert
  to authenticated
  with check ((select app.is_teacher_admin()));

create policy interventions_update
  on app.interventions
  for update
  to authenticated
  using ((select app.is_teacher_admin()))
  with check ((select app.is_teacher_admin()));

-- ---------------------------------------------------------------------------
-- app.system_settings
-- ---------------------------------------------------------------------------
grant select on app.system_settings to authenticated;
grant insert (setting_key, setting_value, updated_by) on app.system_settings to authenticated;
grant update (setting_value, updated_by) on app.system_settings to authenticated;

create policy system_settings_select
  on app.system_settings
  for select
  to authenticated
  using ((select app.is_teacher_admin()));

create policy system_settings_insert
  on app.system_settings
  for insert
  to authenticated
  with check ((select app.is_teacher_admin()));

create policy system_settings_update
  on app.system_settings
  for update
  to authenticated
  using ((select app.is_teacher_admin()))
  with check ((select app.is_teacher_admin()));
