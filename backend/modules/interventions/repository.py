"""Data access for the interventions module.

Reads run as the caller, so the policies decide what the queue contains — a
learner reading this SQL gets nothing at all, which is what the intervention
policy says. Every write is a function call: the educator comes from
`auth.uid()`, the lifecycle is enforced in the database, and the audit row is
written in the same transaction as the change it describes.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from modules.shared.db import ActorConnection

_QUEUE_COLUMNS = """
  interventions.intervention_id,
  interventions.student_id,
  student_profiles.learner_id,
  user_profiles.full_name,
  student_profiles.section_id,
  sections.name as section_name,
  student_profiles.grade_id,
  interventions.competency_id,
  competencies.code as competency_code,
  competencies.name as competency_name,
  interventions.severity,
  interventions.status,
  interventions.intervention_type,
  interventions.incorrect_patterns,
  interventions.modules_attempted,
  interventions.educator_notes,
  interventions.reopen_reason,
  interventions.ai_insight,
  interventions.ai_recommendation,
  interventions.ai_provider,
  interventions.ai_model,
  interventions.ai_confidence_score,
  interventions.teacher_admin_id,
  educator.full_name as recorded_by,
  competency_progress.diagnostic_score,
  competency_progress.current_score,
  competency_progress.attempt_count,
  competency_progress.unsuccessful_attempts,
  interventions.created_at,
  interventions.recorded_at,
  interventions.resolved_at,
  interventions.archived_at
"""

_QUEUE_JOINS = """
from app.interventions
join app.student_profiles
  on student_profiles.student_id = interventions.student_id
join app.user_profiles on user_profiles.user_id = student_profiles.user_id
join app.competencies
  on competencies.competency_id = interventions.competency_id
join app.teacher_admin_profiles
  on teacher_admin_profiles.teacher_admin_id = interventions.teacher_admin_id
join app.user_profiles as educator
  on educator.user_id = teacher_admin_profiles.user_id
left join app.sections on sections.section_id = student_profiles.section_id
left join app.competency_progress
  on competency_progress.student_id = interventions.student_id
 and competency_progress.competency_id = interventions.competency_id
"""

_QUEUE_FILTERS = """
where interventions.archived_at is null
  and ($1::uuid is null or interventions.student_id = $1)
  and ($2::uuid is null or student_profiles.grade_id = $2)
  and ($3::uuid is null or student_profiles.section_id = $3)
  and ($4::uuid is null or interventions.competency_id = $4)
  and ($5::app.intervention_severity is null or interventions.severity = $5)
  and ($6::app.intervention_status is null or interventions.status = $6)
"""

_QUEUE_SQL = f"""
select {_QUEUE_COLUMNS}
{_QUEUE_JOINS}
{_QUEUE_FILTERS}
order by interventions.severity, interventions.created_at desc
limit $7 offset $8
"""

_QUEUE_COUNT_SQL = f"""
select count(*) as total
{_QUEUE_JOINS}
{_QUEUE_FILTERS}
"""

_DETAIL_SQL = f"""
select {_QUEUE_COLUMNS}
{_QUEUE_JOINS}
where interventions.intervention_id = $1
"""

_OPEN_SQL = "select * from app.open_intervention($1, $2, $3, $4, $5, $6)"
_UPDATE_SQL = "select * from app.update_intervention($1, $2, $3, $4, $5, $6, $7)"
_ARCHIVE_SQL = "select app.archive_intervention($1, $2)"


async def queue(
    connection: ActorConnection,
    *,
    student_id: UUID | None,
    grade_id: UUID | None,
    section_id: UUID | None,
    competency_id: UUID | None,
    severity: str | None,
    status: str | None,
    limit: int,
    offset: int,
) -> list[Any]:
    return await connection.fetch(
        _QUEUE_SQL,
        student_id, grade_id, section_id, competency_id, severity, status, limit, offset,
    )


async def queue_total(
    connection: ActorConnection,
    *,
    student_id: UUID | None,
    grade_id: UUID | None,
    section_id: UUID | None,
    competency_id: UUID | None,
    severity: str | None,
    status: str | None,
) -> int:
    return (
        await connection.fetchval(
            _QUEUE_COUNT_SQL, student_id, grade_id, section_id, competency_id, severity, status
        )
        or 0
    )


async def intervention(connection: ActorConnection, intervention_id: UUID) -> Any:
    return await connection.fetchrow(_DETAIL_SQL, intervention_id)


async def record(
    connection: ActorConnection,
    *,
    student_id: UUID,
    competency_id: UUID,
    severity: str,
    intervention_type: str,
    educator_notes: str | None,
    request_id: str | None,
) -> Any:
    return await connection.fetchrow(
        _OPEN_SQL,
        student_id, competency_id, severity, intervention_type, educator_notes, request_id,
    )


async def update(
    connection: ActorConnection,
    *,
    intervention_id: UUID,
    severity: str | None,
    intervention_type: str | None,
    educator_notes: str | None,
    status: str | None,
    reopen_reason: str | None,
    request_id: str | None,
) -> Any:
    return await connection.fetchrow(
        _UPDATE_SQL,
        intervention_id, severity, intervention_type, educator_notes, status,
        reopen_reason, request_id,
    )


async def archive(
    connection: ActorConnection, *, intervention_id: UUID, request_id: str | None
) -> bool:
    return bool(await connection.fetchval(_ARCHIVE_SQL, intervention_id, request_id))
