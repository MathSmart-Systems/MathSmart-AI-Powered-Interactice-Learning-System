-- MathSmart Phase 2 — learning content, part 3 of 3.
--
-- Privileges and Row Level Security for the curriculum tables.
--
-- Answer-key confidentiality
-- --------------------------
-- RLS filters rows; it cannot hide a column. `app.questions.answer_key`,
-- `.explanation` and `.hint` are therefore withheld from `authenticated` at the
-- privilege level: the role holds no SELECT on those three columns at all, so
-- no policy mistake and no crafted query can surface a correct answer before
-- submission. The role does hold INSERT and UPDATE on `answer_key` so a
-- Teacher/Administrator can author one, and the policies below restrict that
-- write to that role — writing a value is not reading it back.
--
-- Reading an authored key, and returning an explanation after a submission, are
-- FastAPI operations performed as `service_role`.
--
-- Publication
-- -----------
-- A learner reads published content only, and only when its parent is published
-- too, so an unpublished competency cannot leak its modules or questions. A
-- Teacher/Administrator reads every publication state.
--
-- Deletion
-- --------
-- Authored content is archived through `status`, never deleted, so no DELETE is
-- granted on the five authored tables. The two membership tables are the
-- exception: replacing an assessment's ordered question set atomically requires
-- removing rows, so DELETE is granted there and restricted to teacher_admin.

-- ---------------------------------------------------------------------------
-- Enable Row Level Security
-- ---------------------------------------------------------------------------
alter table app.competencies         enable row level security;
alter table app.learning_modules     enable row level security;
alter table app.questions            enable row level security;
alter table app.assessments          enable row level security;
alter table app.assessment_questions enable row level security;
alter table app.activities           enable row level security;
alter table app.activity_questions   enable row level security;

-- ---------------------------------------------------------------------------
-- Baseline: revoke everything, then grant back explicitly
-- ---------------------------------------------------------------------------
revoke all on app.competencies         from public, anon, authenticated;
revoke all on app.learning_modules     from public, anon, authenticated;
revoke all on app.questions            from public, anon, authenticated;
revoke all on app.assessments          from public, anon, authenticated;
revoke all on app.assessment_questions from public, anon, authenticated;
revoke all on app.activities           from public, anon, authenticated;
revoke all on app.activity_questions   from public, anon, authenticated;

grant select, insert, update, delete on app.competencies         to service_role;
grant select, insert, update, delete on app.learning_modules     to service_role;
grant select, insert, update, delete on app.questions            to service_role;
grant select, insert, update, delete on app.assessments          to service_role;
grant select, insert, update, delete on app.assessment_questions to service_role;
grant select, insert, update, delete on app.activities           to service_role;
grant select, insert, update, delete on app.activity_questions   to service_role;

-- ---------------------------------------------------------------------------
-- app.competencies
-- ---------------------------------------------------------------------------
grant select on app.competencies to authenticated;
grant insert (code, grade_id, domain, name, description, status, prerequisite_ids)
  on app.competencies to authenticated;
grant update (code, grade_id, domain, name, description, status, prerequisite_ids)
  on app.competencies to authenticated;

create policy competencies_select
  on app.competencies
  for select
  to authenticated
  using ((select app.can_read_content(status)));

create policy competencies_insert
  on app.competencies
  for insert
  to authenticated
  with check ((select app.is_teacher_admin()));

create policy competencies_update
  on app.competencies
  for update
  to authenticated
  using ((select app.is_teacher_admin()))
  with check ((select app.is_teacher_admin()));

-- ---------------------------------------------------------------------------
-- app.learning_modules
-- ---------------------------------------------------------------------------
grant select on app.learning_modules to authenticated;
grant insert (competency_id, title, estimated_minutes, learning_objective,
              short_explanation, rules, worked_examples, status, version, order_index)
  on app.learning_modules to authenticated;
grant update (competency_id, title, estimated_minutes, learning_objective,
              short_explanation, rules, worked_examples, status, version, order_index)
  on app.learning_modules to authenticated;

-- A learner reaches a module only when the module and its competency are both
-- published.
create policy learning_modules_select
  on app.learning_modules
  for select
  to authenticated
  using (
    (select app.is_teacher_admin())
    or (
      status = 'published'
      and competency_id in (
        select competencies.competency_id
        from app.competencies
        where competencies.status = 'published'
      )
    )
  );

create policy learning_modules_insert
  on app.learning_modules
  for insert
  to authenticated
  with check ((select app.is_teacher_admin()));

create policy learning_modules_update
  on app.learning_modules
  for update
  to authenticated
  using ((select app.is_teacher_admin()))
  with check ((select app.is_teacher_admin()));

-- ---------------------------------------------------------------------------
-- app.questions
-- ---------------------------------------------------------------------------
-- The deliberate omission below is the whole point: no SELECT on answer_key,
-- explanation or hint for `authenticated`.
grant select (question_id, competency_id, question_type, difficulty, prompt,
              choices, status, version, created_at, updated_at)
  on app.questions to authenticated;
grant insert (competency_id, question_type, difficulty, prompt, choices,
              answer_key, explanation, hint, status, version)
  on app.questions to authenticated;
grant update (competency_id, question_type, difficulty, prompt, choices,
              answer_key, explanation, hint, status, version)
  on app.questions to authenticated;

create policy questions_select
  on app.questions
  for select
  to authenticated
  using (
    (select app.is_teacher_admin())
    or (
      status = 'published'
      and competency_id in (
        select competencies.competency_id
        from app.competencies
        where competencies.status = 'published'
      )
    )
  );

create policy questions_insert
  on app.questions
  for insert
  to authenticated
  with check ((select app.is_teacher_admin()));

create policy questions_update
  on app.questions
  for update
  to authenticated
  using ((select app.is_teacher_admin()))
  with check ((select app.is_teacher_admin()));

-- ---------------------------------------------------------------------------
-- app.assessments
-- ---------------------------------------------------------------------------
grant select on app.assessments to authenticated;
grant insert (grade_id, title, assessment_type, status, duration_minutes, version)
  on app.assessments to authenticated;
grant update (grade_id, title, assessment_type, status, duration_minutes, version)
  on app.assessments to authenticated;

create policy assessments_select
  on app.assessments
  for select
  to authenticated
  using ((select app.can_read_content(status)));

create policy assessments_insert
  on app.assessments
  for insert
  to authenticated
  with check ((select app.is_teacher_admin()));

create policy assessments_update
  on app.assessments
  for update
  to authenticated
  using ((select app.is_teacher_admin()))
  with check ((select app.is_teacher_admin()));

-- ---------------------------------------------------------------------------
-- app.assessment_questions
-- ---------------------------------------------------------------------------
grant select on app.assessment_questions to authenticated;
grant insert (assessment_id, question_id, position) on app.assessment_questions to authenticated;
grant update (assessment_id, question_id, position) on app.assessment_questions to authenticated;
grant delete on app.assessment_questions to authenticated;

-- Membership is visible exactly when its parent is. The subquery is filtered by
-- the parent's own policy, so the two rules can never drift apart.
create policy assessment_questions_select
  on app.assessment_questions
  for select
  to authenticated
  using (
    (select app.is_teacher_admin())
    or assessment_id in (
      select assessments.assessment_id
      from app.assessments
    )
  );

create policy assessment_questions_insert
  on app.assessment_questions
  for insert
  to authenticated
  with check ((select app.is_teacher_admin()));

create policy assessment_questions_update
  on app.assessment_questions
  for update
  to authenticated
  using ((select app.is_teacher_admin()))
  with check ((select app.is_teacher_admin()));

create policy assessment_questions_delete
  on app.assessment_questions
  for delete
  to authenticated
  using ((select app.is_teacher_admin()));

-- ---------------------------------------------------------------------------
-- app.activities
-- ---------------------------------------------------------------------------
grant select on app.activities to authenticated;
grant insert (module_id, title, description, estimated_minutes, points,
              mastery_threshold, status, version)
  on app.activities to authenticated;
grant update (module_id, title, description, estimated_minutes, points,
              mastery_threshold, status, version)
  on app.activities to authenticated;

create policy activities_select
  on app.activities
  for select
  to authenticated
  using (
    (select app.is_teacher_admin())
    or (
      status = 'published'
      and module_id in (
        select learning_modules.module_id
        from app.learning_modules
        where learning_modules.status = 'published'
      )
    )
  );

create policy activities_insert
  on app.activities
  for insert
  to authenticated
  with check ((select app.is_teacher_admin()));

create policy activities_update
  on app.activities
  for update
  to authenticated
  using ((select app.is_teacher_admin()))
  with check ((select app.is_teacher_admin()));

-- ---------------------------------------------------------------------------
-- app.activity_questions
-- ---------------------------------------------------------------------------
grant select on app.activity_questions to authenticated;
grant insert (activity_id, question_id, position) on app.activity_questions to authenticated;
grant update (activity_id, question_id, position) on app.activity_questions to authenticated;
grant delete on app.activity_questions to authenticated;

-- As above: an activity's membership follows the activity's own visibility,
-- which already requires the parent module to be published too.
create policy activity_questions_select
  on app.activity_questions
  for select
  to authenticated
  using (
    (select app.is_teacher_admin())
    or activity_id in (
      select activities.activity_id
      from app.activities
    )
  );

create policy activity_questions_insert
  on app.activity_questions
  for insert
  to authenticated
  with check ((select app.is_teacher_admin()));

create policy activity_questions_update
  on app.activity_questions
  for update
  to authenticated
  using ((select app.is_teacher_admin()))
  with check ((select app.is_teacher_admin()));

create policy activity_questions_delete
  on app.activity_questions
  for delete
  to authenticated
  using ((select app.is_teacher_admin()));
