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

# The catalogue carries the caller's own attempt columns, so $1 is the user id
# and the filters start at $2. The count carries none of them, so it numbers
# its own filters from $1. Sharing one fragment would leave the count
# referencing $2-$4 and never $1, which PostgreSQL rejects: it takes the
# parameter count from the highest-numbered reference, so an unreferenced lower
# parameter is untyped (42P08). The predicates are identical; only the
# numbering differs.
_CATALOGUE_FILTERS = """
where ($2::app.assessment_type is null or assessments.assessment_type = $2)
  and ($3::uuid is null or assessments.grade_id = $3)
  and ($4::app.publication_status is null or assessments.status = $4)
"""

_LIST_COUNT_FILTERS = """
where ($1::app.assessment_type is null or assessments.assessment_type = $1)
  and ($2::uuid is null or assessments.grade_id = $2)
  and ($3::app.publication_status is null or assessments.status = $3)
"""

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
   order by assessment_attempts.started_at desc limit 1) as latest_status
"""

# S608 flags interpolation into SQL. What is interpolated here is a module
# constant defined a few lines above; every value still travels as a bind
# parameter, and no caller input reaches the statement text.
_LIST_SQL = f"""
select {_CATALOGUE_COLUMNS}
from app.assessments
{_CATALOGUE_FILTERS}
order by assessments.title
limit $5 offset $6
"""  # noqa: S608

_LIST_COUNT_SQL = f"""
select count(*) as total
from app.assessments
{_LIST_COUNT_FILTERS}
"""  # noqa: S608

_DETAIL_SQL = f"""
select {_CATALOGUE_COLUMNS}
from app.assessments
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
  assessment_attempts.submitted_at
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
  competencies.name as competency_name,
  competency_results.raw_score,
  competency_results.max_score,
  competency_results.percentage,
  competency_results.mastery_band
from app.competency_results
join app.competencies on competencies.competency_id = competency_results.competency_id
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
  competencies.code as competency_code,
  competencies.name as competency_name,
  learning_path_items.module_id,
  learning_modules.title as module_title,
  learning_modules.estimated_minutes
from app.learning_path_items
join app.competencies
  on competencies.competency_id = learning_path_items.competency_id
join app.learning_modules
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

_START_ATTEMPT_SQL = "select * from app.start_assessment_attempt($1)"
_SAVE_ANSWERS_SQL = "select app.save_assessment_answers($1, $2::jsonb)"
_SUBMIT_SQL = "select * from app.submit_assessment_attempt($1, $2::jsonb)"
_AUTHORISE_SQL = "select * from app.authorize_reassessment($1, $2, $3, $4, $5)"


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
    return await connection.fetch(
        _LIST_SQL, user_id, assessment_type, grade_id, status, limit, offset
    )


async def listing_total(
    connection: ActorConnection,
    *,
    assessment_type: str | None,
    grade_id: UUID | None,
    status: str | None,
) -> int:
    # No user id: the count has none of the correlated catalogue subqueries
    # that need it.
    return await connection.fetchval(
        _LIST_COUNT_SQL, assessment_type, grade_id, status
    ) or 0


async def assessment(connection: ActorConnection, *, user_id: UUID, assessment_id: UUID) -> Any:
    return await connection.fetchrow(_DETAIL_SQL, user_id, assessment_id)


async def questions_for(connection: ActorConnection, assessment_id: UUID) -> list[Any]:
    return await connection.fetch(_ATTEMPT_QUESTIONS_SQL, assessment_id)


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
