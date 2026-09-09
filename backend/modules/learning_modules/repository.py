"""Data access for the learning modules module.

The catalogue statements carry the learner's own path status and progress as
left joins keyed on the caller's own student record. A Teacher/Administrator has
no student record, so those columns come back null for them from the same SQL —
one statement, two correct answers, no role branch.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from modules.shared.db import ActorConnection

_CATALOGUE_COLUMNS = """
  learning_modules.module_id,
  learning_modules.competency_id,
  competencies.name as competency_name,
  competencies.grade_id,
  learning_modules.title,
  learning_modules.estimated_minutes,
  learning_modules.status,
  learning_modules.order_index,
  learning_path_items.status as path_status,
  student_module_progress.completion_percentage,
  student_module_progress.is_complete
"""

_CATALOGUE_JOINS = """
from app.learning_modules
join app.competencies
  on competencies.competency_id = learning_modules.competency_id
left join app.student_profiles
  on student_profiles.user_id = $1
left join app.learning_path_items
  on learning_path_items.module_id = learning_modules.module_id
 and learning_path_items.student_id = student_profiles.student_id
left join app.student_module_progress
  on student_module_progress.module_id = learning_modules.module_id
 and student_module_progress.student_id = student_profiles.student_id
"""

_LIST_FILTERS = """
where ($2::uuid is null or learning_modules.competency_id = $2)
  and ($3::uuid is null or competencies.grade_id = $3)
  and ($4::app.publication_status is null or learning_modules.status = $4)
  and ($5::text is null or learning_modules.title ilike '%' || $5 || '%')
"""

_LIST_SQL = f"""
select {_CATALOGUE_COLUMNS}
{_CATALOGUE_JOINS}
{_LIST_FILTERS}
order by competencies.code, learning_modules.order_index
limit $6 offset $7
"""

_LIST_COUNT_SQL = f"""
select count(*)
{_CATALOGUE_JOINS}
{_LIST_FILTERS}
"""

_DETAIL_SQL = f"""
select {_CATALOGUE_COLUMNS},
  learning_modules.learning_objective,
  learning_modules.short_explanation,
  learning_modules.rules,
  learning_modules.worked_examples
{_CATALOGUE_JOINS}
where learning_modules.module_id = $2
"""

_ACTIVITIES_SQL = """
select
  activities.activity_id,
  activities.title,
  activities.status
from app.activities
where activities.module_id = $1
order by activities.title
"""

_OWN_PROGRESS_SQL = """
select
  student_module_progress.completion_percentage,
  student_module_progress.is_complete,
  student_module_progress.completed_section_ids,
  student_module_progress.last_section_id,
  student_module_progress.started_at,
  student_module_progress.completed_at
from app.student_module_progress
join app.student_profiles
  on student_profiles.student_id = student_module_progress.student_id
where student_module_progress.module_id = $1
  and student_profiles.user_id = $2
"""

_PROGRESS_FOR_STUDENT_SQL = """
select
  student_module_progress.completion_percentage,
  student_module_progress.is_complete,
  student_module_progress.completed_section_ids,
  student_module_progress.last_section_id,
  student_module_progress.started_at,
  student_module_progress.completed_at
from app.student_module_progress
where student_module_progress.module_id = $1
  and student_module_progress.student_id = $2
"""

# Writes go through functions, not grants. app.student_module_progress is
# SELECT-only for `authenticated`, and these two derive the learner from
# auth.uid() and compute the percentage from the module's own content, so
# neither is the caller's to assert. See the migration for why.
_SAVE_PROGRESS_SQL = "select * from app.save_module_progress($1, $2::text[], $3)"

_COMPLETE_MODULE_SQL = "select * from app.complete_module($1)"


async def listing(
    connection: ActorConnection,
    *,
    user_id: UUID,
    competency_id: UUID | None,
    grade_id: UUID | None,
    status: str | None,
    search: str | None,
    limit: int,
    offset: int,
) -> list[Any]:
    return await connection.fetch(
        _LIST_SQL, user_id, competency_id, grade_id, status, search, limit, offset
    )


async def listing_total(
    connection: ActorConnection,
    *,
    user_id: UUID,
    competency_id: UUID | None,
    grade_id: UUID | None,
    status: str | None,
    search: str | None,
) -> int:
    return (
        await connection.fetchval(
            _LIST_COUNT_SQL, user_id, competency_id, grade_id, status, search
        )
        or 0
    )


async def learning_module(connection: ActorConnection, *, user_id: UUID, module_id: UUID) -> Any:
    return await connection.fetchrow(_DETAIL_SQL, user_id, module_id)


async def activities_for(connection: ActorConnection, module_id: UUID) -> list[Any]:
    return await connection.fetch(_ACTIVITIES_SQL, module_id)


async def own_progress(connection: ActorConnection, *, module_id: UUID, user_id: UUID) -> Any:
    return await connection.fetchrow(_OWN_PROGRESS_SQL, module_id, user_id)


async def progress_for_student(
    connection: ActorConnection, *, module_id: UUID, student_id: UUID
) -> Any:
    return await connection.fetchrow(_PROGRESS_FOR_STUDENT_SQL, module_id, student_id)


async def save_progress(
    connection: ActorConnection,
    *,
    module_id: UUID,
    completed_section_ids: list[str],
    last_section_id: str | None,
) -> Any:
    """Save the calling learner's own progress and return the stored row."""
    return await connection.fetchrow(
        _SAVE_PROGRESS_SQL, module_id, completed_section_ids, last_section_id
    )


async def complete(connection: ActorConnection, *, module_id: UUID) -> Any:
    """Mark the module complete, or return nothing when a section is unfinished."""
    return await connection.fetchrow(_COMPLETE_MODULE_SQL, module_id)
