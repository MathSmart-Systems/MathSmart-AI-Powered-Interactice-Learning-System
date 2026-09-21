-- Per-question miss counts for Reports, and nothing per learner.
--
-- The "most-missed questions" panel needs, for each question, how many
-- learners answered it, how many answers were wrong, and the most common
-- wrong answer. Diagnostic answers are readable by a Teacher/Administrator
-- already. Practice answers are not: `is_correct` on `app.activity_responses`
-- is deliberately withheld from the Data API role
-- (`20260921090000_activity_attempt_question_snapshots`), and that stays so.
--
-- This counts both sources in one place and returns only the totals, per
-- question: no learner, no attempt, no answer key and no row a caller could
-- join back to a child. The caller names the learners to count (the report's
-- cohort, already visible to them) and an optional range and competency.
-- Only an active Teacher/Administrator gets rows; anyone else gets none.

create or replace function app.report_question_misses(
  p_student_ids uuid[],
  p_start timestamptz default null,
  p_until timestamptz default null,
  p_competency_id uuid default null
)
returns table (
  question_id uuid,
  competency_id uuid,
  learners_answered integer,
  answered integer,
  incorrect integer,
  common_wrong_answer jsonb,
  common_wrong_times integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (app.is_active_account() and app.is_teacher_admin()) then
    return;
  end if;

  return query
  with answers as (
    select
      assessment_responses.question_id,
      coalesce(assessment_responses.delivered_competency_id, questions.competency_id)
        as competency_id,
      assessment_attempts.student_id,
      assessment_responses.is_correct,
      assessment_responses.answer
    from app.assessment_responses
    join app.assessment_attempts
      on assessment_attempts.attempt_id = assessment_responses.attempt_id
    join app.questions on questions.question_id = assessment_responses.question_id
    where assessment_attempts.student_id = any (p_student_ids)
      and assessment_attempts.status = 'scored'
      and assessment_responses.is_correct is not null
      and (p_start is null or assessment_attempts.submitted_at >= p_start)
      and (p_until is null or assessment_attempts.submitted_at < p_until)
    union all
    select
      activity_responses.question_id,
      coalesce(activity_responses.delivered_competency_id, questions.competency_id),
      activity_attempts.student_id,
      activity_responses.is_correct,
      activity_responses.answer
    from app.activity_responses
    join app.activity_attempts
      on activity_attempts.attempt_id = activity_responses.attempt_id
    join app.questions on questions.question_id = activity_responses.question_id
    where activity_attempts.student_id = any (p_student_ids)
      and activity_attempts.submitted_at is not null
      and activity_responses.is_correct is not null
      and (p_start is null or activity_attempts.submitted_at >= p_start)
      and (p_until is null or activity_attempts.submitted_at < p_until)
  ),
  scoped as (
    select * from answers
    where p_competency_id is null or answers.competency_id = p_competency_id
  ),
  per_question as (
    select
      scoped.question_id,
      scoped.competency_id,
      count(distinct scoped.student_id)::integer as learners_answered,
      count(*)::integer as answered,
      count(*) filter (where not scoped.is_correct)::integer as incorrect
    from scoped
    group by scoped.question_id, scoped.competency_id
  ),
  wrong as (
    select
      scoped.question_id,
      scoped.answer,
      count(*)::integer as times,
      row_number() over (
        partition by scoped.question_id order by count(*) desc, scoped.answer::text
      ) as rank
    from scoped
    where not scoped.is_correct and scoped.answer is not null
    group by scoped.question_id, scoped.answer
  )
  select
    per_question.question_id,
    per_question.competency_id,
    per_question.learners_answered,
    per_question.answered,
    per_question.incorrect,
    wrong.answer,
    wrong.times
  from per_question
  left join wrong on wrong.question_id = per_question.question_id and wrong.rank = 1;
end;
$$;

comment on function app.report_question_misses(uuid[], timestamptz, timestamptz, uuid) is
  'Per-question answer totals for Reports across diagnostics and practice: learners answered, answers, wrong answers and the most common wrong answer. Never a learner, an attempt or an answer key. Rows only for an active Teacher/Administrator.';

revoke all on function app.report_question_misses(uuid[], timestamptz, timestamptz, uuid) from public;
revoke all on function app.report_question_misses(uuid[], timestamptz, timestamptz, uuid) from anon;
grant execute on function app.report_question_misses(uuid[], timestamptz, timestamptz, uuid)
  to authenticated, service_role;
