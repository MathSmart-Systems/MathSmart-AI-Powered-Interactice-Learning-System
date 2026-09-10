-- MathSmart Phase 3 — student learning records, part 3 of 3.
--
-- Privileges and Row Level Security for the learner-evidence tables.
--
-- Why these seven tables are read-only through the Data API roles
-- ---------------------------------------------------------------
-- Every value in them is calculated: a score, a mastery band, a completion
-- percentage, an attempt count, a recommended next module. Deterministic
-- application code owns all of it, and Groq is advisory and may never decide
-- any of it. So `authenticated` receives SELECT and nothing else — not for
-- learners, and not for Teacher/Administrators either.
--
-- A learner starting an attempt, autosaving an answer, submitting it, or
-- completing a module still happens; it happens through FastAPI as
-- `service_role`, which is where the deterministic rules live and where the
-- audited workflow can be enforced. Withholding INSERT, UPDATE and DELETE here
-- means no client-side path can rewrite an official result even if a policy
-- were later written carelessly.
--
-- The documented Teacher/Administrator scope for learner records is to view
-- them school-wide, not to edit them: taking assessments and saving progress
-- are marked as not available to that role, and intervention records are a
-- separate entity. Grade correction is therefore an audited backend operation,
-- never a direct table write.

-- ---------------------------------------------------------------------------
-- Enable Row Level Security
-- ---------------------------------------------------------------------------
alter table app.assessment_attempts     enable row level security;
alter table app.assessment_responses    enable row level security;
alter table app.competency_results      enable row level security;
alter table app.learning_path_items     enable row level security;
alter table app.student_module_progress enable row level security;
alter table app.activity_attempts       enable row level security;
alter table app.competency_progress     enable row level security;

-- ---------------------------------------------------------------------------
-- Baseline: revoke everything, then grant back explicitly
-- ---------------------------------------------------------------------------
revoke all on app.assessment_attempts     from public, anon, authenticated;
revoke all on app.assessment_responses    from public, anon, authenticated;
revoke all on app.competency_results      from public, anon, authenticated;
revoke all on app.learning_path_items     from public, anon, authenticated;
revoke all on app.student_module_progress from public, anon, authenticated;
revoke all on app.activity_attempts       from public, anon, authenticated;
revoke all on app.competency_progress     from public, anon, authenticated;

grant select, insert, update, delete on app.assessment_attempts     to service_role;
grant select, insert, update, delete on app.assessment_responses    to service_role;
grant select, insert, update, delete on app.competency_results      to service_role;
grant select, insert, update, delete on app.learning_path_items     to service_role;
grant select, insert, update, delete on app.student_module_progress to service_role;
grant select, insert, update, delete on app.activity_attempts       to service_role;
grant select, insert, update, delete on app.competency_progress     to service_role;

-- Read-only for every Data API role. No INSERT, UPDATE or DELETE is granted to
-- `authenticated` on any table in this phase.
grant select on app.assessment_attempts     to authenticated;
grant select on app.assessment_responses    to authenticated;
grant select on app.competency_results      to authenticated;
grant select on app.learning_path_items     to authenticated;
grant select on app.student_module_progress to authenticated;
grant select on app.activity_attempts       to authenticated;
grant select on app.competency_progress     to authenticated;

-- ---------------------------------------------------------------------------
-- Ownership
-- ---------------------------------------------------------------------------
-- A learner reads their own evidence. A Teacher/Administrator reads it
-- school-wide. Nobody else reads anything.

create policy assessment_attempts_select
  on app.assessment_attempts
  for select
  to authenticated
  using (
    student_id = (select app.current_student_id())
    or (select app.is_teacher_admin())
  );

-- Responses and results hang off an attempt rather than carrying a learner of
-- their own. The subquery is filtered by the attempt's policy above, so these
-- follow ownership automatically and cannot drift away from it.
create policy assessment_responses_select
  on app.assessment_responses
  for select
  to authenticated
  using (
    (select app.is_teacher_admin())
    or attempt_id in (
      select assessment_attempts.attempt_id
      from app.assessment_attempts
    )
  );

create policy competency_results_select
  on app.competency_results
  for select
  to authenticated
  using (
    (select app.is_teacher_admin())
    or attempt_id in (
      select assessment_attempts.attempt_id
      from app.assessment_attempts
    )
  );

create policy learning_path_items_select
  on app.learning_path_items
  for select
  to authenticated
  using (
    student_id = (select app.current_student_id())
    or (select app.is_teacher_admin())
  );

create policy student_module_progress_select
  on app.student_module_progress
  for select
  to authenticated
  using (
    student_id = (select app.current_student_id())
    or (select app.is_teacher_admin())
  );

create policy activity_attempts_select
  on app.activity_attempts
  for select
  to authenticated
  using (
    student_id = (select app.current_student_id())
    or (select app.is_teacher_admin())
  );

create policy competency_progress_select
  on app.competency_progress
  for select
  to authenticated
  using (
    student_id = (select app.current_student_id())
    or (select app.is_teacher_admin())
  );
