"""Data access for the competencies module.

Publication visibility is not decided here. `app.can_read_content` is in the
policies on `app.competencies`, so a learner reading this SQL sees published
rows and a Teacher/Administrator sees every row — from the same statement. The
`status` filter is a caller's narrowing of what they may already see, never a
widening of it.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from modules.shared.db import ActorConnection

_LIST_SQL = """
select
  competencies.competency_id,
  competencies.code,
  competencies.grade_id,
  competencies.domain,
  competencies.name,
  competencies.description,
  competencies.status,
  competencies.prerequisite_ids
from app.competencies
where ($1::uuid is null or competencies.grade_id = $1)
  and ($2::text is null or competencies.domain = $2)
  and ($3::app.publication_status is null or competencies.status = $3)
  and (
    $4::text is null
    or competencies.name ilike '%' || $4 || '%'
    or competencies.code ilike '%' || $4 || '%'
  )
order by competencies.code
limit $5 offset $6
"""

_LIST_COUNT_SQL = """
select count(*)
from app.competencies
where ($1::uuid is null or competencies.grade_id = $1)
  and ($2::text is null or competencies.domain = $2)
  and ($3::app.publication_status is null or competencies.status = $3)
  and (
    $4::text is null
    or competencies.name ilike '%' || $4 || '%'
    or competencies.code ilike '%' || $4 || '%'
  )
"""

_DETAIL_SQL = """
select
  competencies.competency_id,
  competencies.code,
  competencies.grade_id,
  competencies.domain,
  competencies.name,
  competencies.description,
  competencies.status,
  competencies.prerequisite_ids
from app.competencies
where competencies.competency_id = $1
"""

_MODULES_SQL = """
select
  learning_modules.module_id,
  learning_modules.title,
  learning_modules.estimated_minutes,
  learning_modules.status,
  learning_modules.order_index
from app.learning_modules
where learning_modules.competency_id = $1
order by learning_modules.order_index
"""

_OWN_PROGRESS_SQL = """
select
  competency_progress.diagnostic_score,
  competency_progress.current_score,
  competency_progress.mastery_band,
  competency_progress.attempt_count,
  competency_progress.last_studied_at
from app.competency_progress
join app.student_profiles
  on student_profiles.student_id = competency_progress.student_id
where competency_progress.competency_id = $1
  and student_profiles.user_id = $2
"""


async def listing(
    connection: ActorConnection,
    *,
    grade_id: UUID | None,
    domain: str | None,
    status: str | None,
    search: str | None,
    limit: int,
    offset: int,
) -> list[Any]:
    return await connection.fetch(
        _LIST_SQL, grade_id, domain, status, search, limit, offset
    )


async def listing_total(
    connection: ActorConnection,
    *,
    grade_id: UUID | None,
    domain: str | None,
    status: str | None,
    search: str | None,
) -> int:
    return await connection.fetchval(_LIST_COUNT_SQL, grade_id, domain, status, search) or 0


async def competency(connection: ActorConnection, competency_id: UUID) -> Any:
    return await connection.fetchrow(_DETAIL_SQL, competency_id)


async def modules_for(connection: ActorConnection, competency_id: UUID) -> list[Any]:
    return await connection.fetch(_MODULES_SQL, competency_id)


async def own_progress(connection: ActorConnection, competency_id: UUID, user_id: UUID) -> Any:
    return await connection.fetchrow(_OWN_PROGRESS_SQL, competency_id, user_id)
