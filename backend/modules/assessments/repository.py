"""Data access for the assessments module.

Two things are worth noticing.

The question query never names `answer_key`, `explanation` or `hint`. That is
not the protection — the protection is that the `authenticated` role holds no
privilege on those columns, so naming them would raise 42501 rather than leak
anything. The query is written this way because it is what it needs.

Every write goes through a function. `app.assessment_attempts`,
`app.assessment_responses`, `app.competency_results`, `app.learning_path_items`
and `app.reassessment_authorizations` are all SELECT-only for the caller, so
starting, saving, grading and authorising are function calls whose actor comes
from `auth.uid()`.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from modules.shared.db import ActorConnection

# $1 is the caller's user id and the filters follow it. The count once numbered
# its own filters from $1 because it carried none of the caller's attempt
# columns, and the two fragments had to stay separate: PostgreSQL takes the
# parameter count from the highest-numbered reference, so a statement that
# skipped $1 left it untyped (42P08). Both now reference $1 — the grade
# predicate below needs it — so one fragment serves both and the numbering
# cannot drift apart again.
#
# The grade predicate is what stops a learner seeing another year group's
# papers. Publication is already settled by `assessments_select`; the year
# group is a product rule rather than a privilege, so it is stated here. A
# Teacher/Administrator sees every grade, which is what their workspace is for,
# and a caller with no learner profile matches nothing rather than everything.
_CATALOGUE_FILTERS = """
where ($2::app.assessment_type is null or assessments.assessment_type = $2)
  and ($3::uuid is null or assessments.grade_id = $3)
  and ($4::app.publication_status is null or assessments.status = $4)
  and (
    app.is_teacher_admin()
    or assessments.grade_id = (
      select student_profiles.grade_id
      from app.student_profiles
      where student_profiles.user_id = $1
    )
  )
"""

_LIST_COUNT_FILTERS = _CATALOGUE_FILTERS

_CATALOGUE_COLUMNS = """
  assessments.assessment_id,
  assessments.grade_id,
  assessments.title,
  assessments.assessment_type,
  assessments.status,
  assessments.duration_minutes,
  assessments.description,
  (select count(*) from app.assessment_questions
   where assessment_questions.assessment_id = assessments.assessment_id)::integer
    as total_questions,
  (select count(*) from app.assessment_attempts
   join app.student_profiles
     on student_profiles.student_id = assessment_attempts.student_id
   where assessment_attempts.assessment_id = assessments.assessment_id
     and student_profiles.user_id = $1)::integer as attempt_count,
  (select assessment_attempts.attempt_id from app.assessment_attempts
   join app.student_profiles
     on student_profiles.student_id = assessment_attempts.student_id
   where assessment_attempts.assessment_id = assessments.assessment_id
     and student_profiles.user_id = $1
   order by assessment_attempts.started_at desc limit 1) as latest_attempt_id,
  (select assessment_attempts.status from app.assessment_attempts
   join app.student_profiles
     on student_profiles.student_id = assessment_attempts.student_id
   where assessment_attempts.assessment_id = assessments.assessment_id
     and student_profiles.user_id = $1
   order by assessment_attempts.started_at desc limit 1) as latest_status,
  readiness.is_ready,
  -- Whether this caller may open this paper, worked out once here rather than
  -- guessed from `latest_status` by every client that lists it. The five
  -- answers are the five things that can be true, and `may_start_reassessment`
  -- is the same function the start route's refusal already rests on, so the
  -- list and the attempt cannot disagree about who is allowed in.
  --
  -- `not_ready` is checked before the three answers that invite a learner in,
  -- because an assessment nobody can start must not be offered as `available`,
  -- resumable or open for a retake. It is checked after `completed`: a learner
  -- who has already sat the paper has finished with it, and telling them their
  -- own result is unavailable because the teacher has since unpublished a
  -- question would be a worse answer than the one they earned.
  (case
     when standing.availability = 'completed' then 'completed'
     when not readiness.is_ready then 'not_ready'
     else standing.availability
   end) as availability
"""

# How many questions the assessment holds, and how many of those a learner
# could actually be given.
#
# The joins are outer on purpose. Under this caller's own row policies a draft
# question, or one under a draft competency, is simply not there — so an inner
# join would drop the membership row from both counts, the two would agree, and
# a paper nobody can start would report itself ready. Keeping the row with a
# null question is what makes the shortfall visible.
_CATALOGUE_MEMBERSHIP_JOIN = """
left join lateral (
  select
    count(*)::integer as question_count,
    count(*) filter (
      where questions.status = 'published'::app.publication_status
        and competencies.status = 'published'::app.publication_status
    )::integer as deliverable_count
  from app.assessment_questions
  left join app.questions on questions.question_id = assessment_questions.question_id
  left join app.competencies on competencies.competency_id = questions.competency_id
  where assessment_questions.assessment_id = assessments.assessment_id
) as membership on true
left join lateral (
  -- Whether starting this paper would actually succeed. These are
  -- `start_assessment_attempt`'s own conditions: it refuses a membership
  -- that is empty or that holds anything whose question or competency is not
  -- published, and it only ever finds a published assessment. Stating them here
  -- is what stops the catalogue offering a paper that would refuse to open.
  select (
    assessments.status = 'published'::app.publication_status
    and membership.question_count > 0
    and membership.deliverable_count = membership.question_count
  ) as is_ready
) as readiness on true
left join lateral (
  select case
     when exists (
       select 1 from app.assessment_attempts
       join app.student_profiles
         on student_profiles.student_id = assessment_attempts.student_id
       where assessment_attempts.assessment_id = assessments.assessment_id
         and student_profiles.user_id = $1
         and assessment_attempts.status = 'in_progress'::app.attempt_status
     ) then 'in_progress'
     when not exists (
       select 1 from app.assessment_attempts
       join app.student_profiles
         on student_profiles.student_id = assessment_attempts.student_id
       where assessment_attempts.assessment_id = assessments.assessment_id
         and student_profiles.user_id = $1
         and assessment_attempts.status <> 'voided'::app.attempt_status
     ) then 'available'
     when app.may_start_reassessment(
       (select student_profiles.student_id from app.student_profiles
        where student_profiles.user_id = $1),
       assessments.assessment_id
     ) then 'reassessment'
     else 'completed'
   end as availability
) as standing on true
"""

# S608 flags interpolation into SQL. What is interpolated here is a module
# constant defined a few lines above; every value still travels as a bind
# parameter, and no caller input reaches the statement text.
_LIST_SQL = f"""
select {_CATALOGUE_COLUMNS}
from app.assessments
{_CATALOGUE_MEMBERSHIP_JOIN}
{_CATALOGUE_FILTERS}
order by assessments.title
limit $5 offset $6
"""  # noqa: S608

# The count carries no catalogue columns, so it carries none of the joins that
# feed them: it answers how many papers match, and readiness is a property of
# each row rather than of the result set.
_LIST_COUNT_SQL = f"""
select count(*) as total
from app.assessments
{_LIST_COUNT_FILTERS}
"""  # noqa: S608

_DETAIL_SQL = f"""
select {_CATALOGUE_COLUMNS}
from app.assessments
{_CATALOGUE_MEMBERSHIP_JOIN}
where assessments.assessment_id = $2
"""  # noqa: S608

# No answer_key, no explanation, no hint. The privileges make that a rule; this
# is the query that observes it.
_ATTEMPT_QUESTIONS_SQL = """
select
  questions.question_id,
  questions.competency_id,
  competencies.name as competency_name,
  questions.prompt,
  questions.question_type,
  questions.choices,
  questions.difficulty,
  questions.visual_aid_description,
  assessment_questions.position
from app.assessment_questions
join app.questions on questions.question_id = assessment_questions.question_id
join app.competencies on competencies.competency_id = questions.competency_id
where assessment_questions.assessment_id = $1
order by assessment_questions.position
"""

# The questions one attempt was actually given, read from the copy frozen
# against it at the moment it began.
#
# `_ATTEMPT_QUESTIONS_SQL` above reads the assessment's current membership,
# which is right before an attempt exists and wrong afterwards: a question
# archived mid-attempt disappears from this query under RLS, while the attempt
# keeps its snapshot row and still grades it — so a resumed learner saw fewer
# questions than they were scored on, and a reordered assessment delivered a
# different order from the one recorded against them.
#
# `delivered_payload` is constrained against ever holding a key, a correct
# answer, an explanation, a hint or a verdict, and `grading_answer_key` is not
# granted to this caller at all.
_DELIVERED_QUESTIONS_SQL = """
select
  assessment_responses.question_id,
  assessment_responses.delivered_competency_id as competency_id,
  assessment_responses.delivered_payload ->> 'competency_name' as competency_name,
  assessment_responses.delivered_payload ->> 'text' as prompt,
  assessment_responses.delivered_payload ->> 'type' as question_type,
  coalesce(assessment_responses.delivered_payload -> 'choices', '[]'::jsonb) as choices,
  assessment_responses.delivered_payload ->> 'difficulty' as difficulty,
  assessment_responses.delivered_payload ->> 'visual_aid_description'
    as visual_aid_description,
  assessment_responses.delivered_position as position
from app.assessment_responses
where assessment_responses.attempt_id = $1
  and assessment_responses.delivered_position is not null
order by assessment_responses.delivered_position
"""

_SAVED_ANSWERS_SQL = """
select assessment_responses.question_id, assessment_responses.answer
from app.assessment_responses
where assessment_responses.attempt_id = $1
"""

_OPEN_ATTEMPT_SQL = """
select assessment_attempts.attempt_id
from app.assessment_attempts
join app.student_profiles
  on student_profiles.student_id = assessment_attempts.student_id
where assessment_attempts.assessment_id = $1
  and student_profiles.user_id = $2
  and assessment_attempts.status = 'in_progress'
"""

_ATTEMPT_SQL = """
select
  assessment_attempts.attempt_id,
  assessment_attempts.assessment_id,
  assessment_attempts.student_id,
  assessment_attempts.status,
  assessment_attempts.overall_score,
  assessment_attempts.started_at,
  assessment_attempts.submitted_at,
  assessment_attempts.result_payload
from app.assessment_attempts
where assessment_attempts.attempt_id = $1
"""

_ATTEMPT_HISTORY_SQL = """
select
  assessment_attempts.attempt_id,
  assessment_attempts.assessment_id,
  assessments.title,
  assessments.assessment_type,
  assessment_attempts.status,
  assessment_attempts.overall_score,
  assessment_attempts.started_at,
  assessment_attempts.submitted_at
from app.assessment_attempts
join app.assessments on assessments.assessment_id = assessment_attempts.assessment_id
where assessment_attempts.student_id = $1
order by assessment_attempts.started_at desc
limit $2 offset $3
"""

_ATTEMPT_HISTORY_COUNT_SQL = """
select count(*) as total
from app.assessment_attempts
where assessment_attempts.student_id = $1
"""

_RESULTS_SQL = """
select
  competency_results.competency_id,
  coalesce(competencies.name, 'Competency') as competency_name,
  competency_results.raw_score,
  competency_results.max_score,
  competency_results.percentage,
  competency_results.mastery_band
from app.competency_results
left join app.competencies on competencies.competency_id = competency_results.competency_id
where competency_results.attempt_id = $1
order by competency_results.percentage
"""

_PATH_SQL = """
select
  learning_path_items.path_item_id,
  learning_path_items.priority,
  learning_path_items.reason,
  learning_path_items.status,
  learning_path_items.competency_id,
  coalesce(competencies.code, '') as competency_code,
  coalesce(competencies.name, 'Competency') as competency_name,
  learning_path_items.module_id,
  coalesce(learning_modules.title, 'Learning Module') as module_title,
  coalesce(learning_modules.estimated_minutes, 15) as estimated_minutes
from app.learning_path_items
left join app.competencies
  on competencies.competency_id = learning_path_items.competency_id
left join app.learning_modules
  on learning_modules.module_id = learning_path_items.module_id
where learning_path_items.student_id = $1
order by learning_path_items.priority
"""

_DIAGNOSTIC_STATUS_SQL = """
select
  student_profiles.diagnostic_status,
  (select assessment_attempts.attempt_id
   from app.assessment_attempts
   join app.assessments
     on assessments.assessment_id = assessment_attempts.assessment_id
   where assessment_attempts.student_id = student_profiles.student_id
     and assessments.assessment_type = 'diagnostic'
   order by assessment_attempts.started_at desc limit 1) as latest_attempt_id,
  (select assessment_attempts.overall_score
   from app.assessment_attempts
   join app.assessments
     on assessments.assessment_id = assessment_attempts.assessment_id
   where assessment_attempts.student_id = student_profiles.student_id
     and assessments.assessment_type = 'diagnostic'
   order by assessment_attempts.started_at desc limit 1) as latest_score,
  (select reassessment_authorizations.authorization_id
   from app.reassessment_authorizations
   where reassessment_authorizations.student_id = student_profiles.student_id
     and reassessment_authorizations.consumed_at is null
     and (reassessment_authorizations.expires_at is null
          or reassessment_authorizations.expires_at > now())
   order by reassessment_authorizations.granted_at desc limit 1) as authorization_id
from app.student_profiles
where student_profiles.student_id = $1
"""

# What a learner got right, once the paper is closed.
#
# Every column here is one `authenticated` already holds: `is_correct`, the
# learner's own `answer`, and the frozen `delivered_payload`, which a CHECK
# constraint forbids from ever carrying a key, a correct answer, an
# explanation, a hint or a verdict. `grading_answer_key` sits in the same table
# and is absent from the column grant, so this query could not read it even if
# somebody added it to the select list.
#
# The verdict is the database's, recorded at submission. Nothing recomputes it
# here, and no advisory text can change it.
_ATTEMPT_REVIEW_SQL = """
select
  assessment_responses.question_id,
  assessment_responses.delivered_position as position,
  assessment_responses.delivered_competency_id as competency_id,
  assessment_responses.delivered_payload ->> 'competency_name' as competency_name,
  assessment_responses.delivered_payload ->> 'text' as text,
  assessment_responses.delivered_payload ->> 'type' as question_type,
  coalesce(assessment_responses.delivered_payload -> 'choices', '[]'::jsonb) as choices,
  assessment_responses.answer,
  assessment_responses.is_correct
from app.assessment_responses
join app.assessment_attempts
  on assessment_attempts.attempt_id = assessment_responses.attempt_id
where assessment_responses.attempt_id = $1
  and assessment_attempts.status in (
    'submitted'::app.attempt_status, 'scored'::app.attempt_status
  )
  and assessment_responses.delivered_position is not null
order by assessment_responses.delivered_position
"""

_START_ATTEMPT_SQL = "select * from app.start_assessment_attempt($1)"
_SAVE_ANSWERS_SQL = "select app.save_assessment_answers($1, $2::jsonb)"
_SUBMIT_SQL = "select * from app.submit_assessment_attempt($1, $2::jsonb)"
_AUTHORISE_SQL = "select * from app.authorize_reassessment($1, $2, $3, $4, $5)"

_OWN_STUDENT_SQL = """
select student_profiles.student_id
from app.student_profiles
where student_profiles.user_id = $1
"""


async def own_student_id(connection: ActorConnection, user_id: UUID) -> Any:
    """Resolve the caller's `user_id` to their `student_id`, or ``None``.

    No student identifier is ever accepted from a request; this is the
    authoritative server-side resolution. Returns ``None`` when no learner
    profile has been created yet for the given user.
    """
    return await connection.fetchval(_OWN_STUDENT_SQL, user_id)


async def listing(
    connection: ActorConnection,
    *,
    user_id: UUID,
    assessment_type: str | None,
    grade_id: UUID | None,
    status: str | None,
    limit: int,
    offset: int,
) -> list[Any]:
    """Return the published assessment catalogue with the caller's attempt summary."""
    return await connection.fetch(
        _LIST_SQL, user_id, assessment_type, grade_id, status, limit, offset
    )


async def listing_total(
    connection: ActorConnection,
    *,
    user_id: UUID,
    assessment_type: str | None,
    grade_id: UUID | None,
    status: str | None,
) -> int:
    """How many assessments this caller can see, not how many exist.

    The user id is needed now: the count shares the catalogue's filters, and
    those restrict a learner to their own year group.
    """
    return await connection.fetchval(
        _LIST_COUNT_SQL, user_id, assessment_type, grade_id, status
    ) or 0


async def assessment(connection: ActorConnection, *, user_id: UUID, assessment_id: UUID) -> Any:
    return await connection.fetchrow(_DETAIL_SQL, user_id, assessment_id)


async def questions_for(connection: ActorConnection, assessment_id: UUID) -> list[Any]:
    return await connection.fetch(_ATTEMPT_QUESTIONS_SQL, assessment_id)


async def delivered_questions(connection: ActorConnection, attempt_id: UUID) -> list[Any]:
    """The frozen question set of one attempt, in its delivered order."""
    return await connection.fetch(_DELIVERED_QUESTIONS_SQL, attempt_id)


async def saved_answers(connection: ActorConnection, attempt_id: UUID) -> list[Any]:
    return await connection.fetch(_SAVED_ANSWERS_SQL, attempt_id)


async def open_attempt_id(
    connection: ActorConnection, *, assessment_id: UUID, user_id: UUID
) -> Any:
    return await connection.fetchval(_OPEN_ATTEMPT_SQL, assessment_id, user_id)


async def attempt(connection: ActorConnection, attempt_id: UUID) -> Any:
    return await connection.fetchrow(_ATTEMPT_SQL, attempt_id)


async def attempt_history(
    connection: ActorConnection, *, student_id: UUID, limit: int, offset: int
) -> list[Any]:
    return await connection.fetch(_ATTEMPT_HISTORY_SQL, student_id, limit, offset)


async def attempt_history_total(connection: ActorConnection, *, student_id: UUID) -> int:
    return await connection.fetchval(_ATTEMPT_HISTORY_COUNT_SQL, student_id) or 0


async def results_for(connection: ActorConnection, attempt_id: UUID) -> list[Any]:
    return await connection.fetch(_RESULTS_SQL, attempt_id)


async def path_for(connection: ActorConnection, student_id: UUID) -> list[Any]:
    return await connection.fetch(_PATH_SQL, student_id)


async def diagnostic_status(connection: ActorConnection, student_id: UUID) -> Any:
    return await connection.fetchrow(_DIAGNOSTIC_STATUS_SQL, student_id)


async def start_attempt(connection: ActorConnection, assessment_id: UUID) -> Any:
    return await connection.fetchrow(_START_ATTEMPT_SQL, assessment_id)


_LEARNER_GRADE_SQL = """
select student_profiles.grade_id
from app.student_profiles
where student_profiles.user_id = $1
"""


async def learner_grade_id(connection: ActorConnection, *, user_id: UUID) -> Any:
    """The year group the calling learner is enrolled in, or nothing.

    Nothing is the safe answer as well as the honest one: a caller with no
    learner record matches no grade, so the visibility check refuses rather
    than falls open.
    """
    return await connection.fetchval(_LEARNER_GRADE_SQL, user_id)


async def attempt_review(connection: ActorConnection, attempt_id: UUID) -> list[Any]:
    """The per-question verdicts for a closed attempt, in the order it was sat.

    Empty while the attempt is still open, which is deliberate: telling a
    learner mid-paper which answers are right would turn the assessment into a
    quiz with a tutor.
    """
    return await connection.fetch(_ATTEMPT_REVIEW_SQL, attempt_id)


async def save_answers(connection: ActorConnection, *, attempt_id: UUID, answers: str) -> int:
    return await connection.fetchval(_SAVE_ANSWERS_SQL, attempt_id, answers) or 0


async def submit_attempt(
    connection: ActorConnection, *, attempt_id: UUID, answers: str | None
) -> Any:
    return await connection.fetchrow(_SUBMIT_SQL, attempt_id, answers)


async def authorise_reassessment(
    connection: ActorConnection,
    *,
    student_id: UUID,
    assessment_id: UUID,
    reason: str,
    expires_at: Any,
    request_id: str | None,
) -> Any:
    return await connection.fetchrow(
        _AUTHORISE_SQL, student_id, assessment_id, reason, expires_at, request_id
    )
