"""Data access for the students module.

Every function here takes an actor-scoped connection, so what it can see is
already limited by the caller's own policies. A learner reading their own record
and a Teacher/Administrator reading the roster run the same SQL; the database
decides how much of it comes back.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from modules.shared.db import ActorConnection

_OWN_LEARNER_SQL = """
select
  student_profiles.student_id,
  student_profiles.user_id,
  student_profiles.learner_id,
  user_profiles.full_name,
  student_profiles.grade_id,
  student_profiles.section_id,
  student_profiles.monitoring_status,
  student_profiles.diagnostic_status
from app.student_profiles
join app.user_profiles on user_profiles.user_id = student_profiles.user_id
where student_profiles.user_id = $1
"""

_ROSTER_SQL = """
select
  student_profiles.student_id,
  student_profiles.user_id,
  student_profiles.learner_id,
  user_profiles.full_name,
  student_profiles.grade_id,
  student_profiles.section_id,
  student_profiles.monitoring_status,
  student_profiles.diagnostic_status
from app.student_profiles
join app.user_profiles on user_profiles.user_id = student_profiles.user_id
where ($1::uuid is null or student_profiles.grade_id = $1)
  and ($2::uuid is null or student_profiles.section_id = $2)
order by student_profiles.learner_id
limit $3 offset $4
"""

_ROSTER_COUNT_SQL = """
select count(*)
from app.student_profiles
where ($1::uuid is null or student_profiles.grade_id = $1)
  and ($2::uuid is null or student_profiles.section_id = $2)
"""


async def own_learner(connection: ActorConnection, user_id: UUID) -> Any:
    return await connection.fetchrow(_OWN_LEARNER_SQL, user_id)


async def roster(
    connection: ActorConnection,
    *,
    grade_id: UUID | None,
    section_id: UUID | None,
    limit: int,
    offset: int,
) -> list[Any]:
    return await connection.fetch(_ROSTER_SQL, grade_id, section_id, limit, offset)


async def roster_total(
    connection: ActorConnection, *, grade_id: UUID | None, section_id: UUID | None
) -> int:
    return await connection.fetchval(_ROSTER_COUNT_SQL, grade_id, section_id) or 0
