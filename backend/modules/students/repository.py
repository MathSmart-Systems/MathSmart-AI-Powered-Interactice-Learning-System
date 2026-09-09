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


_LEARNER_BY_ID_SQL = """
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
where student_profiles.student_id = $1
"""

# The one column a learner may write on their own profile. The grant says so;
# this statement observes it.
_UPDATE_OWN_NAME_SQL = """
update app.user_profiles
set full_name = $2
where user_profiles.user_id = $1
returning user_profiles.user_id
"""

_UPDATE_LEARNER_SQL = """
update app.student_profiles
set grade_id = coalesce($2, student_profiles.grade_id),
    section_id = coalesce($3, student_profiles.section_id),
    monitoring_status = coalesce($4::app.monitoring_status,
                                 student_profiles.monitoring_status),
    school_name = coalesce($5, student_profiles.school_name)
where student_profiles.student_id = $1
returning student_profiles.student_id
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


async def learner(connection: ActorConnection, student_id: UUID) -> Any:
    return await connection.fetchrow(_LEARNER_BY_ID_SQL, student_id)


async def update_own_name(connection: ActorConnection, *, user_id: UUID, full_name: str) -> Any:
    return await connection.fetchrow(_UPDATE_OWN_NAME_SQL, user_id, full_name)


async def update_learner(
    connection: ActorConnection,
    *,
    student_id: UUID,
    grade_id: UUID | None,
    section_id: UUID | None,
    monitoring_status: str | None,
    school_name: str | None,
) -> Any:
    return await connection.fetchrow(
        _UPDATE_LEARNER_SQL, student_id, grade_id, section_id, monitoring_status, school_name
    )
