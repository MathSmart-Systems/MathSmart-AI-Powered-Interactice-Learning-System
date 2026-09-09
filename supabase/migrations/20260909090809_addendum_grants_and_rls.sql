-- MathSmart Phase 5a — API contract addendum, part 3 of 3.
--
-- Privileges and Row Level Security for the addendum.
--
-- A column added to a table does not inherit a column-level grant. Several
-- tables were deliberately granted column by column in earlier phases, so the
-- new columns are granted explicitly below. Tables granted at table level need
-- no change, because a table-level privilege covers columns added later.

-- ---------------------------------------------------------------------------
-- app.audit_events — append-only for everyone
-- ---------------------------------------------------------------------------
alter table app.audit_events enable row level security;

revoke all on app.audit_events from public, anon, authenticated;

-- The backend writes audit records and never edits them. No role holds UPDATE
-- or DELETE, so a record cannot be altered or erased after the fact, which is
-- the property that makes it an audit trail rather than a log.
grant select, insert on app.audit_events to service_role;
grant select on app.audit_events to authenticated;

create policy audit_events_select
  on app.audit_events
  for select
  to authenticated
  using ((select app.is_teacher_admin()));

-- ---------------------------------------------------------------------------
-- app.idempotency_keys — backend only
-- ---------------------------------------------------------------------------
-- Replay protection is infrastructure, not application data. No Data API role
-- reaches it at all; a stored response body could otherwise be read back by
-- whoever guessed a key.
alter table app.idempotency_keys enable row level security;

revoke all on app.idempotency_keys from public, anon, authenticated;

grant select, insert, update, delete on app.idempotency_keys to service_role;

-- ---------------------------------------------------------------------------
-- app.activity_responses — follows its attempt, exactly as assessment responses do
-- ---------------------------------------------------------------------------
alter table app.activity_responses enable row level security;

revoke all on app.activity_responses from public, anon, authenticated;

grant select, insert, update, delete on app.activity_responses to service_role;
grant select on app.activity_responses to authenticated;

create policy activity_responses_select
  on app.activity_responses
  for select
  to authenticated
  using (
    (select app.is_teacher_admin())
    or attempt_id in (
      select activity_attempts.attempt_id
      from app.activity_attempts
    )
  );

-- ---------------------------------------------------------------------------
-- app.reassessment_authorizations — educator territory
-- ---------------------------------------------------------------------------
-- The grant carries a pedagogical reason written about a learner, so the
-- learner does not read it. Eligibility is surfaced to the learner by the
-- backend as a boolean, without the reason.
alter table app.reassessment_authorizations enable row level security;

revoke all on app.reassessment_authorizations from public, anon, authenticated;

grant select, insert, update, delete on app.reassessment_authorizations to service_role;
grant select on app.reassessment_authorizations to authenticated;

create policy reassessment_authorizations_select
  on app.reassessment_authorizations
  for select
  to authenticated
  using ((select app.is_teacher_admin()));

-- ---------------------------------------------------------------------------
-- New columns on column-granted tables
-- ---------------------------------------------------------------------------
-- app.questions was granted column by column precisely so answer_key,
-- explanation and hint stay unreadable. The accessible visual-aid description
-- is safe to deliver before submission, so it joins the readable set; the three
-- server-only columns are still absent from it.
grant select (visual_aid_description) on app.questions to authenticated;
grant insert (visual_aid_description) on app.questions to authenticated;
grant update (visual_aid_description) on app.questions to authenticated;

-- A learner may set their own display preferences.
grant update (preferences) on app.user_profiles to authenticated;

-- Enrolment fields a Teacher/Administrator maintains.
grant insert (school_name) on app.student_profiles to authenticated;
grant update (school_name, diagnostic_status) on app.student_profiles to authenticated;

-- Assessment authoring gains a description.
grant insert (description) on app.assessments to authenticated;
grant update (description) on app.assessments to authenticated;

-- Intervention authoring gains advisory provenance and a reopen reason.
grant insert (ai_provider, ai_model, ai_confidence_score, ai_generated_at, reopen_reason)
  on app.interventions to authenticated;
grant update (ai_provider, ai_model, ai_confidence_score, ai_generated_at, reopen_reason)
  on app.interventions to authenticated;

-- Everything else added in this phase sits on tables granted at table level, so
-- it is already covered: app.activity_attempts, app.assessment_attempts,
-- app.assessment_responses and app.student_module_progress are all SELECT-only
-- for `authenticated` and remain so.

-- ---------------------------------------------------------------------------
-- Reporting keeps up with the roster shape
-- ---------------------------------------------------------------------------
-- The learner summary shape carries diagnostic_status, so the performance view
-- surfaces it too. Recreated with security_invoker restated, so the property
-- that makes the view safe is never left to inheritance.
create or replace view app.student_performance_summary
with (security_invoker = true) as
select
  student_profiles.student_id,
  student_profiles.learner_id,
  user_profiles.full_name,
  student_profiles.grade_id,
  student_profiles.section_id,
  student_profiles.monitoring_status,
  (select round(avg(competency_progress.diagnostic_score), 2)
     from app.competency_progress
    where competency_progress.student_id = student_profiles.student_id) as diagnostic_average,
  (select round(avg(competency_progress.current_score), 2)
     from app.competency_progress
    where competency_progress.student_id = student_profiles.student_id) as current_average,
  (select count(*)
     from app.competency_progress
    where competency_progress.student_id = student_profiles.student_id
      and competency_progress.mastery_band = 'Mastered') as competencies_mastered,
  (select count(*)
     from app.student_module_progress
    where student_module_progress.student_id = student_profiles.student_id
      and student_module_progress.is_complete) as modules_completed,
  (select count(*)
     from app.student_module_progress
    where student_module_progress.student_id = student_profiles.student_id) as modules_started,
  (select count(*)
     from app.assessment_attempts
    where assessment_attempts.student_id = student_profiles.student_id
      and assessment_attempts.status = 'scored') as scored_attempt_count,
  (select coalesce(max(competency_progress.unsuccessful_attempts), 0)
     from app.competency_progress
    where competency_progress.student_id = student_profiles.student_id) as worst_unsuccessful_attempts,
  (select count(*)
     from app.interventions
    where interventions.student_id = student_profiles.student_id
      and interventions.archived_at is null
      and interventions.status <> 'Resolved') as open_intervention_count,
  (select max(competency_progress.last_studied_at)
     from app.competency_progress
    where competency_progress.student_id = student_profiles.student_id) as last_studied_at,
  student_profiles.diagnostic_status
from app.student_profiles
join app.user_profiles on user_profiles.user_id = student_profiles.user_id;

comment on view app.student_performance_summary is
  'Per-learner performance derived from authoritative records. security_invoker, so a learner sees only their own row.';
