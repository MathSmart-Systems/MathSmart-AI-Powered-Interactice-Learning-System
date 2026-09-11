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

# The learner-safe payload is frozen when the attempt starts. The confidential
# grading key lives in a separate column that authenticated actors cannot select.
_ATTEMPT_QUESTIONS_SQL = """
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
  and assessment_responses.answer is not null
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
  coalesce(assessment_attempts.assessment_type_snapshot, assessments.assessment_type)
    as assessment_type,
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

# $2 names the assessment the caller is actually looking at. Without it the
# latest diagnostic of any assessment answers for the one on screen, and the
# eligibility that comes back belongs to a different assessment than the one the
# learner is about to sit.
_DIAGNOSTIC_STATUS_SQL = """
select
  student_profiles.diagnostic_status as profile_status,
  case
    when $2::uuid is null then student_profiles.diagnostic_status
    when latest.status = 'in_progress'::app.attempt_status
      then 'in_progress'::app.diagnostic_status
    when latest.status in (
      'submitted'::app.attempt_status,
      'scored'::app.attempt_status
    ) then 'completed'::app.diagnostic_status
    else 'not_started'::app.diagnostic_status
  end as diagnostic_status,
  coalesce($2::uuid, latest.assessment_id) as assessment_id,
  latest.attempt_id as latest_attempt_id,
  latest.status as latest_status,
  latest.overall_score as latest_score,
  case
    when latest.attempt_id is null then false
    else app.may_start_reassessment(
      student_profiles.student_id,
      coalesce($2::uuid, latest.assessment_id)
    )
  end as reassessment_eligible
from app.student_profiles
left join lateral (
  select
    assessment_attempts.attempt_id,
    assessment_attempts.assessment_id,
    assessment_attempts.status,
    assessment_attempts.overall_score
  from app.assessment_attempts
  join app.assessments
    on assessments.assessment_id = assessment_attempts.assessment_id
  where assessment_attempts.student_id = student_profiles.student_id
    and coalesce(
      assessment_attempts.assessment_type_snapshot,
      assessments.assessment_type
    ) = 'diagnostic'
    and ($2::uuid is null or assessment_attempts.assessment_id = $2)
  order by assessment_attempts.started_at desc, assessment_attempts.attempt_id desc
  limit 1
) as latest on true
where student_profiles.student_id = $1
"""

_START_ATTEMPT_SQL = "select * from app.start_assessment_attempt($1)"
_SAVE_ANSWERS_SQL = "select app.save_assessment_answers($1, $2::jsonb)"
_CLAIM_SUBMISSION_SQL = (
    "select * from app.claim_assessment_submission_idempotency($1, $2)"
)
_SUBMIT_SQL = "select * from app.submit_assessment_attempt($1, $2::jsonb)"
_COMPLETE_SUBMISSION_SQL = (
    "select app.complete_assessment_submission_idempotency($1, $2, $3, $4::jsonb)"
)
_AUTHORISE_SQL = "select * from app.authorize_reassessment($1, $2, $3, $4, $5)"
_OWN_STUDENT_SQL = """
select student_profiles.student_id
from app.student_profiles
where student_profiles.user_id = $1
"""


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


async def questions_for(connection: ActorConnection, attempt_id: UUID) -> list[Any]:
    return await connection.fetch(_ATTEMPT_QUESTIONS_SQL, attempt_id)


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


async def diagnostic_status(
    connection: ActorConnection, student_id: UUID, assessment_id: UUID | None = None
) -> Any:
    return await connection.fetchrow(_DIAGNOSTIC_STATUS_SQL, student_id, assessment_id)


async def own_student_id(connection: ActorConnection, user_id: UUID) -> Any:
    return await connection.fetchval(_OWN_STUDENT_SQL, user_id)


async def start_attempt(connection: ActorConnection, assessment_id: UUID) -> Any:
    return await connection.fetchrow(_START_ATTEMPT_SQL, assessment_id)


async def save_answers(connection: ActorConnection, *, attempt_id: UUID, answers: str) -> int:
    return await connection.fetchval(_SAVE_ANSWERS_SQL, attempt_id, answers) or 0


async def claim_submission(
    connection: ActorConnection, *, idempotency_key: str, request_fingerprint: str
) -> Any:
    return await connection.fetchrow(
        _CLAIM_SUBMISSION_SQL, idempotency_key, request_fingerprint
    )


async def submit_attempt(
    connection: ActorConnection, *, attempt_id: UUID, answers: str | None
) -> Any:
    return await connection.fetchrow(_SUBMIT_SQL, attempt_id, answers)


async def complete_submission(
    connection: ActorConnection,
    *,
    idempotency_key: str,
    request_fingerprint: str,
    response_status: int,
    response_body: str,
) -> bool:
    return bool(
        await connection.fetchval(
            _COMPLETE_SUBMISSION_SQL,
            idempotency_key,
            request_fingerprint,
            response_status,
            response_body,
        )
    )


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
