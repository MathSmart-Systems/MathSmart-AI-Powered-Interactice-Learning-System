-- MathSmart — removing authored content that was never used.
--
-- Archiving is the right answer for anything that has been taught: the learner
-- records pointing at it all have to survive. This is for the other case — a
-- prompt typed wrong, a draft abandoned, a duplicate created by accident —
-- where archiving only leaves a dead entry nobody can clear. The same case
-- `app.competencies` and `app.sections` were opened for, and the same two
-- guards, neither of which is the interface.
--
-- The policies below admit only a Teacher/Administrator, and only a record that
-- is already archived. Archiving is reversible, so every deletion is reached
-- through a state the teacher could have stepped back from, and a live or draft
-- record is never one click from being gone.
--
-- What makes it safe is the second guard, which was here already: every foreign
-- key pointing at these four tables from a learner record is ON DELETE
-- RESTRICT. PostgreSQL refuses the statement whatever the policy says and
-- whatever the API forgets to check. The API's reference count exists to
-- explain a refusal, not to be trusted for it.
--
--   app.questions is held by
--     app.assessment_questions.question_id   (restrict)
--     app.activity_questions.question_id     (restrict)
--     app.assessment_responses.question_id   (restrict)
--     app.activity_responses.question_id     (restrict)
--
--   app.learning_modules is held by
--     app.activities.module_id               (restrict)
--     app.learning_path_items.module_id      (restrict)
--     app.student_module_progress.module_id  (restrict)
--
--   app.activities is held by
--     app.activity_attempts.activity_id      (restrict)
--     app.activity_questions.activity_id     (cascade — membership, see below)
--
--   app.assessments is held by
--     app.assessment_attempts.assessment_id          (restrict)
--     app.reassessment_authorizations.assessment_id  (restrict)
--     app.assessment_questions.assessment_id         (cascade — membership)
--
-- The two cascades are the point rather than a hole. Membership is a join row
-- that says "this activity contains this question"; it has no meaning once the
-- activity is gone, and it is the only thing that goes with it. The question it
-- names is held by its own RESTRICT, so deleting an unused activity or an
-- unused assessment can never reach a reusable question.
--
-- The indirect evidence needs no rule of its own and gets none:
-- app.assessment_responses and app.competency_results cascade from
-- app.assessment_attempts, which restricts; app.activity_responses cascades
-- from app.activity_attempts, which restricts. Nothing a learner did can be
-- removed to make content deletable.

begin;

grant delete on app.questions        to authenticated;
grant delete on app.learning_modules to authenticated;
grant delete on app.activities       to authenticated;
grant delete on app.assessments      to authenticated;

create policy questions_delete
  on app.questions
  for delete
  to authenticated
  using (
    (select app.is_teacher_admin())
    -- Archived first. A published or draft question is not in scope for
    -- removal at all, so the destructive step is always a second decision
    -- taken after a reversible one.
    and status = 'archived'::app.publication_status
  );

comment on policy questions_delete on app.questions is
  'A Teacher/Administrator may remove an archived question. One still seated in an activity or an assessment, or delivered to any attempt, is refused by the ON DELETE RESTRICT foreign keys, so only a question that was never used can actually go.';

create policy learning_modules_delete
  on app.learning_modules
  for delete
  to authenticated
  using (
    (select app.is_teacher_admin())
    and status = 'archived'::app.publication_status
  );

comment on policy learning_modules_delete on app.learning_modules is
  'A Teacher/Administrator may remove an archived module. One carrying an activity, a learning-path item or a learner''s module progress is refused by the ON DELETE RESTRICT foreign keys.';

create policy activities_delete
  on app.activities
  for delete
  to authenticated
  using (
    (select app.is_teacher_admin())
    and status = 'archived'::app.publication_status
  );

comment on policy activities_delete on app.activities is
  'A Teacher/Administrator may remove an archived activity. One any learner has attempted is refused by app.activity_attempts, which restricts. Its membership rows go with it; the questions they name do not.';

create policy assessments_delete
  on app.assessments
  for delete
  to authenticated
  using (
    (select app.is_teacher_admin())
    and status = 'archived'::app.publication_status
  );

comment on policy assessments_delete on app.assessments is
  'A Teacher/Administrator may remove an archived assessment. One with an attempt or a reassessment authorization against it is refused by the ON DELETE RESTRICT foreign keys. Its membership rows go with it; the questions they name do not.';

commit;
