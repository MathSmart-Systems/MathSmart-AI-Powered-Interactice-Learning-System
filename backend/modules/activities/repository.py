"""Data access for the activities module.

The catalogue carries the caller's own attempt count, best score and path
status as correlated subqueries keyed on their own student record, so one
statement serves a learner and a Teacher/Administrator alike.

Checking an answer, taking a hint and submitting are function calls: the
answer key and the hint are columns the caller cannot select, and the learner
record is SELECT-only for them.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from modules.shared.db import ActorConnection

_CATALOGUE_COLUMNS = """
  activities.activity_id,
  activities.module_id,
  learning_modules.title as module_title,
  learning_modules.competency_id,
  competencies.name as competency_name,
  activities.title,
  activities.description,
  activities.estimated_minutes,
  activities.points,
  activities.mastery_threshold,
  activities.status,
  (select count(*) from app.activity_attempts
   join app.student_profiles
     on student_profiles.student_id = activity_attempts.student_id
   where activity_attempts.activity_id = activities.activity_id
     and student_profiles.user_id = $1)::integer as attempt_count,
  (select max(activity_attempts.score_percentage) from app.activity_attempts
   join app.student_profiles
     on student_profiles.student_id = activity_attempts.student_id
   where activity_attempts.activity_id = activities.activity_id
     and student_profiles.user_id = $1) as best_score,
  (select learning_path_items.status from app.learning_path_items
   join app.student_profiles
     on student_profiles.student_id = learning_path_items.student_id
   where learning_path_items.module_id = activities.module_id
     and student_profiles.user_id = $1) as path_status,
  membership.question_count,
  -- Whether starting this activity would actually succeed, answered here
  -- rather than guessed from `status` by every client that lists it.
  --
  -- A published activity with nothing in it, or holding a question whose
  -- competency is still a draft, looks live in the catalogue and then refuses
  -- `start_activity_attempt` with "The activity has no complete published
  -- question set" — a learner opened it, waited, and was told the practice was
  -- not ready. The conditions below are that function's conditions, so the
  -- catalogue and the start cannot disagree about what is deliverable.
  (
    activities.status = 'published'::app.publication_status
    and learning_modules.status = 'published'::app.publication_status
    and competencies.status = 'published'::app.publication_status
    and membership.question_count > 0
    and membership.deliverable_count = membership.question_count
  ) as is_ready
"""

_CATALOGUE_JOINS = """
from app.activities
join app.learning_modules on learning_modules.module_id = activities.module_id
join app.competencies
  on competencies.competency_id = learning_modules.competency_id
"""

# How many questions the activity holds, and how many of those a learner could
# actually be given.
#
# The joins are outer on purpose. Under this caller's own row policies a draft
# question, or one under a draft competency, is simply not there — so an inner
# join would drop the membership row from both counts, the two would agree, and
# an activity nobody can start would report itself ready. Keeping the row with a
# null question is what makes the shortfall visible.
#
# `competencies` is already joined above as the *module's* competency, which is
# a different row from the competency a question belongs to; the alias keeps the
# two apart.
_CATALOGUE_MEMBERSHIP_JOIN = """
left join lateral (
  select
    count(*)::integer as question_count,
    count(*) filter (
      where questions.status = 'published'::app.publication_status
        and question_competencies.status = 'published'::app.publication_status
    )::integer as deliverable_count
  from app.activity_questions
  left join app.questions on questions.question_id = activity_questions.question_id
  left join app.competencies as question_competencies
    on question_competencies.competency_id = questions.competency_id
  where activity_questions.activity_id = activities.activity_id
) as membership on true
"""

# The list carries the caller's own attempt columns, so $1 is the user id and
# the filters start at $2. The count carries none of them, so it numbers its
# own filters from $1. Sharing one fragment would leave the count referencing
# $2-$5 and never $1, which PostgreSQL rejects: it takes the parameter count
# from the highest-numbered reference, so an unreferenced lower parameter is
# untyped (42P08). The predicates are identical; only the numbering differs.
_LIST_FILTERS = """
where ($2::uuid is null or activities.module_id = $2)
  and ($3::uuid is null or learning_modules.competency_id = $3)
  and ($4::app.publication_status is null or activities.status = $4)
  and ($5::text is null or activities.title ilike '%' || $5 || '%')
"""

_LIST_COUNT_FILTERS = """
where ($1::uuid is null or activities.module_id = $1)
  and ($2::uuid is null or learning_modules.competency_id = $2)
  and ($3::app.publication_status is null or activities.status = $3)
  and ($4::text is null or activities.title ilike '%' || $4 || '%')
"""

_LIST_SQL = f"""
select {_CATALOGUE_COLUMNS}
{_CATALOGUE_JOINS}
{_CATALOGUE_MEMBERSHIP_JOIN}
{_LIST_FILTERS}
order by activities.title
limit $6 offset $7
"""

# The count carries no catalogue columns, so it carries no membership join
# either: it answers how many activities match, and readiness is a property of
# each row rather than of the result set.
_LIST_COUNT_SQL = f"""
select count(*) as total
{_CATALOGUE_JOINS}
{_LIST_COUNT_FILTERS}
"""

_DETAIL_SQL = f"""
select {_CATALOGUE_COLUMNS}
{_CATALOGUE_JOINS}
{_CATALOGUE_MEMBERSHIP_JOIN}
where activities.activity_id = $2
"""

# No answer_key, no explanation, no hint.
_QUESTIONS_SQL = """
select
  questions.question_id,
  questions.competency_id,
  competencies.name as competency_name,
  questions.prompt,
  questions.question_type,
  questions.choices,
  questions.difficulty,
  questions.visual_aid_description,
  activity_questions.position
from app.activity_questions
join app.questions on questions.question_id = activity_questions.question_id
join app.competencies on competencies.competency_id = questions.competency_id
where activity_questions.activity_id = $1
order by activity_questions.position
"""

# The questions one in-progress attempt was actually given, read from the copy
# frozen against it rather than from the activity's current membership.
#
# Delivery used to re-read `app.activity_questions` on every load. A question
# archived while a learner had the activity open then vanished from their
# screen — but the attempt still holds a snapshot row for it and still grades
# it, so they were marked on an item they could no longer see. This is the same
# rule assessments already follow.
#
# No answer key, no explanation, no hint: those columns are not granted to the
# caller at all, and none of them is named here.
_ATTEMPT_QUESTIONS_SQL = """
select
  activity_responses.question_id,
  activity_responses.delivered_competency_id as competency_id,
  activity_responses.delivered_payload ->> 'competency_name' as competency_name,
  activity_responses.delivered_payload ->> 'text' as prompt,
  activity_responses.delivered_payload ->> 'type' as question_type,
  coalesce(activity_responses.delivered_payload -> 'choices', '[]'::jsonb) as choices,
  activity_responses.delivered_payload ->> 'difficulty' as difficulty,
  activity_responses.delivered_payload ->> 'visual_aid_description'
    as visual_aid_description,
  activity_responses.delivered_position as position
from app.activity_responses
join app.activity_attempts
  on activity_attempts.attempt_id = activity_responses.attempt_id
join app.student_profiles
  on student_profiles.student_id = activity_attempts.student_id
where activity_attempts.activity_id = $1
  and student_profiles.user_id = $2
  and activity_attempts.status = 'in_progress'
  and activity_responses.delivered_position is not null
order by activity_responses.delivered_position
"""

_SAVED_ANSWERS_SQL = """
select activity_responses.question_id, activity_responses.answer
from app.activity_responses
where activity_responses.attempt_id = $1
"""

# $2 and $3 are the page window, which the count does not have, so the count
# numbers its filters from $2 rather than binding two unreferenced parameters.
_HISTORY_FILTERS = """
where activity_attempts.student_id = $1
  and ($4::uuid is null or activity_attempts.activity_id = $4)
  and ($5::uuid is null or learning_modules.competency_id = $5)
  and ($6::boolean is null or activity_attempts.passed = $6)
"""

_HISTORY_COUNT_FILTERS = """
where activity_attempts.student_id = $1
  and ($2::uuid is null or activity_attempts.activity_id = $2)
  and ($3::uuid is null or learning_modules.competency_id = $3)
  and ($4::boolean is null or activity_attempts.passed = $4)
"""

_HISTORY_SQL = f"""
select
  activity_attempts.attempt_id,
  activity_attempts.activity_id,
  activities.title,
  learning_modules.competency_id,
  competencies.name as competency_name,
  activity_attempts.status,
  activity_attempts.attempt_number,
  activity_attempts.raw_score,
  activity_attempts.max_score,
  activity_attempts.score_percentage,
  activity_attempts.passed,
  activity_attempts.time_spent_seconds,
  activity_attempts.submitted_at
from app.activity_attempts
join app.activities on activities.activity_id = activity_attempts.activity_id
join app.learning_modules on learning_modules.module_id = activities.module_id
join app.competencies
  on competencies.competency_id = learning_modules.competency_id
{_HISTORY_FILTERS}
order by activity_attempts.submitted_at desc nulls first
limit $2 offset $3
"""  # noqa: S608

_HISTORY_COUNT_SQL = f"""
select count(*) as total
from app.activity_attempts
join app.activities on activities.activity_id = activity_attempts.activity_id
join app.learning_modules on learning_modules.module_id = activities.module_id
{_HISTORY_COUNT_FILTERS}
"""  # noqa: S608

_START_SQL = "select * from app.start_activity_attempt($1)"
_CHECK_SQL = "select * from app.check_activity_answer($1, $2, $3::jsonb)"
_HINT_SQL = "select app.activity_hint($1, $2)"
_SUBMIT_SQL = "select * from app.submit_activity_attempt($1, $2::jsonb, $3)"


async def listing(
    connection: ActorConnection,
    *,
    user_id: UUID,
    module_id: UUID | None,
    competency_id: UUID | None,
    status: str | None,
    search: str | None,
    limit: int,
    offset: int,
) -> list[Any]:
    return await connection.fetch(
        _LIST_SQL, user_id, module_id, competency_id, status, search, limit, offset
    )


async def listing_total(
    connection: ActorConnection,
    *,
    module_id: UUID | None,
    competency_id: UUID | None,
    status: str | None,
    search: str | None,
) -> int:
    # No user id: the count has none of the correlated catalogue subqueries
    # that need it.
    return (
        await connection.fetchval(
            _LIST_COUNT_SQL, module_id, competency_id, status, search
        )
        or 0
    )


async def activity(connection: ActorConnection, *, user_id: UUID, activity_id: UUID) -> Any:
    return await connection.fetchrow(_DETAIL_SQL, user_id, activity_id)


async def questions_for(connection: ActorConnection, activity_id: UUID) -> list[Any]:
    return await connection.fetch(_QUESTIONS_SQL, activity_id)


async def attempt_questions(
    connection: ActorConnection, *, activity_id: UUID, user_id: UUID
) -> list[Any]:
    """The frozen question set of the caller's own open attempt, if they have one."""
    return await connection.fetch(_ATTEMPT_QUESTIONS_SQL, activity_id, user_id)


async def saved_answers(connection: ActorConnection, attempt_id: UUID) -> list[Any]:
    return await connection.fetch(_SAVED_ANSWERS_SQL, attempt_id)


async def history(
    connection: ActorConnection,
    *,
    student_id: UUID,
    activity_id: UUID | None,
    competency_id: UUID | None,
    passed: bool | None,
    limit: int,
    offset: int,
) -> list[Any]:
    return await connection.fetch(
        _HISTORY_SQL, student_id, limit, offset, activity_id, competency_id, passed
    )


async def history_total(
    connection: ActorConnection,
    *,
    student_id: UUID,
    activity_id: UUID | None,
    competency_id: UUID | None,
    passed: bool | None,
) -> int:
    return (
        await connection.fetchval(
            _HISTORY_COUNT_SQL, student_id, activity_id, competency_id, passed
        )
        or 0
    )


async def start_attempt(connection: ActorConnection, activity_id: UUID) -> Any:
    return await connection.fetchrow(_START_SQL, activity_id)


async def check_answer(
    connection: ActorConnection, *, attempt_id: UUID, question_id: UUID, answer: str
) -> Any:
    return await connection.fetchrow(_CHECK_SQL, attempt_id, question_id, answer)


async def hint(connection: ActorConnection, *, attempt_id: UUID, question_id: UUID) -> Any:
    return await connection.fetchval(_HINT_SQL, attempt_id, question_id)


async def submit_attempt(
    connection: ActorConnection, *, attempt_id: UUID, answers: str, time_spent_seconds: int
) -> Any:
    return await connection.fetchrow(_SUBMIT_SQL, attempt_id, answers, time_spent_seconds)
