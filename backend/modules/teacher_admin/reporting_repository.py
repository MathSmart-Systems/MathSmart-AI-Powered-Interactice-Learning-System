"""Data access for the Teacher/Administrator reporting routes.

Every rollup comes from a `security_invoker` reporting view, so the same
statement answers correctly for whoever runs it. The heatmap is the one query
that reads base tables directly, because it needs a learner-by-competency grid
that no view provides.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from modules.shared.db import ActorConnection

_DASHBOARD_SQL = """
select
  teacher_dashboard_summary.learner_count,
  teacher_dashboard_summary.active_count,
  teacher_dashboard_summary.needs_support_count,
  teacher_dashboard_summary.improving_count,
  teacher_dashboard_summary.mastered_count,
  teacher_dashboard_summary.average_mastery,
  teacher_dashboard_summary.open_intervention_count,
  teacher_dashboard_summary.published_competency_count,
  teacher_dashboard_summary.scored_attempt_count,
  teacher_dashboard_summary.completed_module_count
from app.teacher_dashboard_summary
"""

_SECTIONS_SQL = """
select
  section_performance_summary.section_id,
  section_performance_summary.grade_id,
  section_performance_summary.section_name,
  section_performance_summary.adviser_id,
  adviser.full_name as adviser_name,
  section_performance_summary.is_active,
  section_performance_summary.learner_count,
  section_performance_summary.active_count,
  section_performance_summary.needs_intervention_count,
  section_performance_summary.improving_count,
  section_performance_summary.mastered_count,
  section_performance_summary.inactive_count,
  section_performance_summary.average_current_score
from app.section_performance_summary
left join app.teacher_admin_profiles
  on teacher_admin_profiles.teacher_admin_id = section_performance_summary.adviser_id
left join app.user_profiles as adviser
  on adviser.user_id = teacher_admin_profiles.user_id
where ($1::uuid is null or section_performance_summary.grade_id = $1)
order by section_performance_summary.section_name
"""

_LEARNERS_SQL = """
select
  student_performance_summary.student_id,
  student_performance_summary.learner_id,
  student_performance_summary.full_name,
  student_performance_summary.grade_id,
  student_performance_summary.section_id,
  sections.name as section_name,
  student_performance_summary.monitoring_status,
  student_profiles.diagnostic_status,
  student_performance_summary.diagnostic_average,
  student_performance_summary.current_average,
  student_performance_summary.competencies_mastered,
  student_performance_summary.modules_completed,
  student_performance_summary.modules_started,
  student_performance_summary.scored_attempt_count,
  student_performance_summary.worst_unsuccessful_attempts,
  student_performance_summary.open_intervention_count,
  student_performance_summary.last_studied_at
from app.student_performance_summary
join app.student_profiles
  on student_profiles.student_id = student_performance_summary.student_id
left join app.sections on sections.section_id = student_performance_summary.section_id
where ($1::uuid is null or student_performance_summary.grade_id = $1)
  and ($2::uuid is null or student_performance_summary.section_id = $2)
  and (
    not $3::boolean
    or student_performance_summary.monitoring_status = 'needs_intervention'
    or student_performance_summary.open_intervention_count > 0
  )
order by student_performance_summary.learner_id
limit $4 offset $5
"""

_COMPETENCIES_SQL = """
select
  competency_mastery_summary.competency_id,
  competency_mastery_summary.code,
  competency_mastery_summary.name,
  competency_mastery_summary.domain,
  competency_mastery_summary.grade_id,
  competency_mastery_summary.status,
  competency_mastery_summary.learners_tracked,
  competency_mastery_summary.mastered_count,
  competency_mastery_summary.developing_count,
  competency_mastery_summary.needs_improvement_count,
  competency_mastery_summary.average_current_score,
  competency_mastery_summary.average_diagnostic_score
from app.competency_mastery_summary
where ($1::uuid is null or competency_mastery_summary.grade_id = $1)
order by competency_mastery_summary.code
"""

_HEATMAP_SQL = """
select
  competency_progress.student_id,
  student_profiles.learner_id,
  user_profiles.full_name,
  competency_progress.competency_id,
  competencies.code as competency_code,
  competency_progress.current_score,
  competency_progress.mastery_band
from app.competency_progress
join app.student_profiles
  on student_profiles.student_id = competency_progress.student_id
join app.user_profiles on user_profiles.user_id = student_profiles.user_id
join app.competencies
  on competencies.competency_id = competency_progress.competency_id
where student_profiles.section_id = $1
order by student_profiles.learner_id, competencies.code
"""

_AUDIT_SQL = "select app.record_audit_event($1, $2, $3, $4, $5::jsonb)"


async def dashboard(connection: ActorConnection) -> Any:
    return await connection.fetchrow(_DASHBOARD_SQL)


async def sections(connection: ActorConnection, *, grade_id: UUID | None) -> list[Any]:
    return await connection.fetch(_SECTIONS_SQL, grade_id)


async def learners(
    connection: ActorConnection,
    *,
    grade_id: UUID | None,
    section_id: UUID | None,
    at_risk_only: bool,
    limit: int,
    offset: int,
) -> list[Any]:
    return await connection.fetch(
        _LEARNERS_SQL, grade_id, section_id, at_risk_only, limit, offset
    )


async def competencies(connection: ActorConnection, *, grade_id: UUID | None) -> list[Any]:
    return await connection.fetch(_COMPETENCIES_SQL, grade_id)


async def heatmap(connection: ActorConnection, section_id: UUID) -> list[Any]:
    return await connection.fetch(_HEATMAP_SQL, section_id)


async def record_audit_event(
    connection: ActorConnection,
    *,
    action: str,
    target_type: str,
    target_id: UUID | None,
    request_id: str | None,
    details: str,
) -> Any:
    return await connection.fetchval(
        _AUDIT_SQL, action, target_type, target_id, request_id, details
    )
