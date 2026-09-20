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
  grade_levels.name as grade_name,
  sections.name as section_name,
  student_profiles.school_name,
  student_profiles.monitoring_status,
  student_profiles.diagnostic_status,
  user_profiles.account_status
from app.student_profiles
join app.user_profiles on user_profiles.user_id = student_profiles.user_id
left join app.sections on sections.section_id = student_profiles.section_id
left join app.grade_levels on grade_levels.grade_id = student_profiles.grade_id
where student_profiles.user_id = $1
"""

#: Which learners a roster read is about.
#:
#: The filter runs in SQL, never in the API, so the page, the total and the
#: per-section counts are the same question asked once. A roster that dropped
#: archived rows after paging would report a number it had not shown.
STATUS_ENROLLED = "enrolled"
STATUS_DROPPED = "dropped"
STATUS_ALL = "all"

#: Written out in each statement rather than interpolated into them. The two
#: are the same question and have to stay the same answer, but a query built by
#: string substitution is a query a reader has to assemble in their head before
#: they can check it — and the roster and its total are exactly where a
#: difference would go unnoticed.
_ROSTER_SQL = """
select
  student_profiles.student_id,
  student_profiles.user_id,
  student_profiles.learner_id,
  user_profiles.full_name,
  student_profiles.grade_id,
  student_profiles.section_id,
  grade_levels.name as grade_name,
  sections.name as section_name,
  student_profiles.school_name,
  student_profiles.monitoring_status,
  student_profiles.diagnostic_status,
  user_profiles.account_status
from app.student_profiles
join app.user_profiles on user_profiles.user_id = student_profiles.user_id
left join app.sections on sections.section_id = student_profiles.section_id
left join app.grade_levels on grade_levels.grade_id = student_profiles.grade_id
where ($1::uuid is null or student_profiles.grade_id = $1)
  and ($2::uuid is null or student_profiles.section_id = $2)
  and (
    $5 = 'all'
    or ($5 = 'dropped' and user_profiles.account_status = 'archived'::app.account_status)
    or (
      $5 = 'enrolled'
      and user_profiles.account_status is distinct from 'archived'::app.account_status
    )
  )
order by student_profiles.learner_id
limit $3 offset $4
"""

_ROSTER_COUNT_SQL = """
select count(*)
from app.student_profiles
join app.user_profiles on user_profiles.user_id = student_profiles.user_id
where ($1::uuid is null or student_profiles.grade_id = $1)
  and ($2::uuid is null or student_profiles.section_id = $2)
  and (
    $3 = 'all'
    or ($3 = 'dropped' and user_profiles.account_status = 'archived'::app.account_status)
    or (
      $3 = 'enrolled'
      and user_profiles.account_status is distinct from 'archived'::app.account_status
    )
  )
"""

#: How many learners each section holds, enrolled and dropped counted apart.
#:
#: Counted across the whole roster rather than the page that was returned. A
#: section header offering "select all" has to say a true number: one taken
#: from the loaded rows would read 38 where the section holds 72, and the
#: teacher would think they had seen everyone they were about to drop.
_ROSTER_SECTION_COUNTS_SQL = """
select
  student_profiles.section_id,
  count(*) filter (
    where user_profiles.account_status is distinct from 'archived'::app.account_status
  ) as enrolled,
  count(*) filter (
    where user_profiles.account_status = 'archived'::app.account_status
  ) as dropped
from app.student_profiles
join app.user_profiles on user_profiles.user_id = student_profiles.user_id
where ($1::uuid is null or student_profiles.grade_id = $1)
group by student_profiles.section_id
"""


_LEARNER_BY_ID_SQL = """
select
  student_profiles.student_id,
  student_profiles.user_id,
  student_profiles.learner_id,
  user_profiles.full_name,
  student_profiles.grade_id,
  student_profiles.section_id,
  grade_levels.name as grade_name,
  sections.name as section_name,
  student_profiles.school_name,
  student_profiles.monitoring_status,
  student_profiles.diagnostic_status,
  user_profiles.account_status
from app.student_profiles
join app.user_profiles on user_profiles.user_id = student_profiles.user_id
left join app.sections on sections.section_id = student_profiles.section_id
left join app.grade_levels on grade_levels.grade_id = student_profiles.grade_id
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


#: The grade a learner is being enrolled into, read so the level can be checked
#: rather than trusted from the request.
_GRADE_LEVEL_SQL = """
select grade_levels.level
from app.grade_levels
where grade_levels.grade_id = $1
"""

#: The section a learner is being placed in, with the grade it belongs to and
#: whether it is still live. One read answers both questions.
_SECTION_PLACEMENT_SQL = """
select sections.grade_id, sections.is_active
from app.sections
where sections.section_id = $1
"""


#: Which learners in a section a drop would actually act on.
#:
#: Resolved in the database, not supplied by the request, so "drop this whole
#: section" means the section as it stands at that moment rather than the page
#: the browser happened to be showing. Already-dropped learners are left out,
#: which makes a repeated drop a no-op instead of a second audit entry.
_DROPPABLE_IN_SECTION_SQL = """
select student_profiles.user_id
from app.student_profiles
join app.user_profiles on user_profiles.user_id = student_profiles.user_id
where student_profiles.section_id = $1
  and user_profiles.account_status is distinct from 'archived'::app.account_status
order by student_profiles.learner_id
"""

#: The same question asked of named accounts.
#:
#: The join to app.student_profiles is the point: it is what stops this route
#: archiving a Teacher/Administrator. An id that is not a learner's simply does
#: not come back, and the caller is told which ones were refused.
_DROPPABLE_LEARNERS_SQL = """
select student_profiles.user_id
from app.student_profiles
join app.user_profiles on user_profiles.user_id = student_profiles.user_id
where student_profiles.user_id = any($1::uuid[])
  and user_profiles.account_status is distinct from 'archived'::app.account_status
order by student_profiles.learner_id
"""

#: Which of the named accounts are learners at all, dropped or not.
#: Used to tell "already dropped" apart from "not a learner".
_KNOWN_LEARNERS_SQL = """
select student_profiles.user_id
from app.student_profiles
where student_profiles.user_id = any($1::uuid[])
"""

#: Archives every named account in one statement.
#:
#: app.set_account_status is reused rather than an UPDATE, because it is the
#: function that holds the rules: it refuses the caller's own account, it sets
#: archived_at, and it writes one audit event per learner. One statement means
#: one transaction, so a batch that hits a refusal archives nobody rather than
#: leaving the roster half-cleared.
#: Dropping retires the learning state as well as the access.
#:
#: app.monitoring_status has no 'dropped' member; 'inactive' is its existing
#: word for a learner who is not being monitored. Without this, a dropped
#: learner keeps monitoring_status = 'active' and the roster ends up showing
#: "Active" and "Dropped" on the same row.
_RETIRE_MONITORING_SQL = """
update app.student_profiles
set monitoring_status = 'inactive'
where student_profiles.user_id = any($1::uuid[])
"""

#: Restoring returns the learner to the roster: an active placement in a
#: section the caller named, and monitoring resumed. Nothing derived is
#: touched — no score, band, growth or progression is recalculated here, and
#: the history those are built from is never read.
_RESTORE_PLACEMENT_SQL = """
update app.student_profiles
set section_id = $2,
    grade_id = $3,
    monitoring_status = 'active'
where student_profiles.student_id = $1
returning student_profiles.student_id
"""

#: The learner a restore is about, with the state that decides whether it is
#: allowed and whether their former section can be offered back.
_RESTORABLE_SQL = """
select
  student_profiles.student_id,
  student_profiles.user_id,
  student_profiles.learner_id,
  user_profiles.full_name,
  user_profiles.role,
  user_profiles.account_status,
  student_profiles.section_id as former_section_id,
  sections.name as former_section_name,
  sections.is_active as former_section_is_active,
  sections.grade_id as former_section_grade_id
from app.student_profiles
join app.user_profiles on user_profiles.user_id = student_profiles.user_id
left join app.sections on sections.section_id = student_profiles.section_id
where student_profiles.student_id = $1
"""

_ARCHIVE_ACCOUNTS_SQL = """
select (archived.profile).user_id as user_id
from (
  select app.set_account_status(
    candidate, 'archived'::app.account_status, $2
  ) as profile
  from unnest($1::uuid[]) as candidate
) as archived
"""


async def grade_level(connection: ActorConnection, grade_id: UUID) -> Any:
    """The numeric level of a grade, or None when there is no such grade."""
    return await connection.fetchval(_GRADE_LEVEL_SQL, grade_id)


async def section_placement(connection: ActorConnection, section_id: UUID) -> Any:
    """The grade a section belongs to and whether it is still active."""
    return await connection.fetchrow(_SECTION_PLACEMENT_SQL, section_id)


async def own_learner(connection: ActorConnection, user_id: UUID) -> Any:
    return await connection.fetchrow(_OWN_LEARNER_SQL, user_id)


async def roster(
    connection: ActorConnection,
    *,
    grade_id: UUID | None,
    section_id: UUID | None,
    limit: int,
    offset: int,
    status: str = STATUS_ENROLLED,
) -> list[Any]:
    return await connection.fetch(_ROSTER_SQL, grade_id, section_id, limit, offset, status)


async def roster_total(
    connection: ActorConnection,
    *,
    grade_id: UUID | None,
    section_id: UUID | None,
    status: str = STATUS_ENROLLED,
) -> int:
    return await connection.fetchval(_ROSTER_COUNT_SQL, grade_id, section_id, status) or 0


async def section_counts(connection: ActorConnection, *, grade_id: UUID | None) -> list[Any]:
    """How many learners each section holds, enrolled and dropped apart."""
    return await connection.fetch(_ROSTER_SECTION_COUNTS_SQL, grade_id)


async def droppable_in_section(connection: ActorConnection, section_id: UUID) -> list[Any]:
    """The learners a section-wide drop would archive, read at this moment."""
    return await connection.fetch(_DROPPABLE_IN_SECTION_SQL, section_id)


async def droppable_learners(connection: ActorConnection, user_ids: list[UUID]) -> list[Any]:
    """Which of the named accounts are learners who are not already dropped."""
    return await connection.fetch(_DROPPABLE_LEARNERS_SQL, user_ids)


async def known_learners(connection: ActorConnection, user_ids: list[UUID]) -> list[Any]:
    """Which of the named accounts are learners at all, dropped or not."""
    return await connection.fetch(_KNOWN_LEARNERS_SQL, user_ids)


async def archive_accounts(
    connection: ActorConnection, *, user_ids: list[UUID], request_id: str | None
) -> list[Any]:
    """Archives every named account, or none of them."""
    return await connection.fetch(_ARCHIVE_ACCOUNTS_SQL, user_ids, request_id)


async def retire_monitoring(connection: ActorConnection, *, user_ids: list[UUID]) -> str:
    """Stops monitoring every named learner, so no row reads active and dropped."""
    return await connection.execute(_RETIRE_MONITORING_SQL, user_ids)


async def restorable(connection: ActorConnection, student_id: UUID) -> Any:
    """The learner a restore names, and the former section it might offer back."""
    return await connection.fetchrow(_RESTORABLE_SQL, student_id)


#: Returns the account to active. The same audited function drop uses, asked
#: the other way: it refuses a caller changing their own status and records
#: every change, which an UPDATE here would not.
_RESTORE_ACCOUNT_SQL = """
select (app.set_account_status($1, 'active'::app.account_status, $2)).user_id as user_id
"""


async def restore_account(
    connection: ActorConnection, *, user_id: UUID, request_id: str | None
) -> Any:
    """Makes a dropped account usable again."""
    return await connection.fetchrow(_RESTORE_ACCOUNT_SQL, user_id, request_id)


async def restore_placement(
    connection: ActorConnection, *, student_id: UUID, section_id: UUID, grade_id: UUID
) -> Any:
    """Puts a learner back in a section and resumes monitoring."""
    return await connection.fetchrow(
        _RESTORE_PLACEMENT_SQL, student_id, section_id, grade_id
    )


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
