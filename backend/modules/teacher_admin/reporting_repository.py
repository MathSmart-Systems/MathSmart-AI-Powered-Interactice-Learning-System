"""Data access for the Teacher/Administrator reporting routes.

Most rollups come from a `security_invoker` reporting view, so the same
statement answers correctly for whoever runs it. Three queries read base tables
directly, and each for the same reason: the caller chose a cohort no view is
scoped to. The heatmap needs a learner-by-competency grid; the dashboard totals
must answer for the selected grade and section rather than the whole school;
the competency rollup must do the same for a section. Reading the base tables
keeps that honest, because the base-table policies are what a `security_invoker`
view was deferring to anyway.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from modules.shared.db import ActorConnection

# `app.teacher_dashboard_summary` is school-wide by construction, so it cannot
# answer for a chosen grade or section. This reproduces its figures over the
# same base tables with the cohort named once, in `scoped_learners`, so the
# totals describe the same learners as the competency rollup and the priority
# list beside them. With both parameters null it is the view.
_DASHBOARD_SQL = """
with scoped_learners as (
  select student_profiles.student_id, student_profiles.monitoring_status
  from app.student_profiles
  where ($1::uuid is null or student_profiles.grade_id = $1)
    and ($2::uuid is null or student_profiles.section_id = $2)
)
select
  (select count(*) from scoped_learners) as learner_count,
  (select count(*) from scoped_learners
    where scoped_learners.monitoring_status = 'active') as active_count,
  (select count(*) from scoped_learners
    where scoped_learners.monitoring_status = 'needs_intervention')
    as needs_support_count,
  (select count(*) from scoped_learners
    where scoped_learners.monitoring_status = 'improving') as improving_count,
  (select count(*) from scoped_learners
    where scoped_learners.monitoring_status = 'mastered') as mastered_count,
  (select round(avg(competency_progress.current_score), 2)
     from app.competency_progress
     join scoped_learners
       on scoped_learners.student_id = competency_progress.student_id)
    as average_mastery,
  (select count(*)
     from app.interventions
     join scoped_learners on scoped_learners.student_id = interventions.student_id
    where interventions.archived_at is null
      and interventions.status <> 'Resolved') as open_intervention_count,
  -- A competency belongs to a grade, not to a section, so the section filter
  -- has nothing further to narrow here.
  (select count(*) from app.competencies
    where competencies.status = 'published'
      and ($1::uuid is null or competencies.grade_id = $1))
    as published_competency_count,
  (select count(*)
     from app.assessment_attempts
     join scoped_learners
       on scoped_learners.student_id = assessment_attempts.student_id
    where assessment_attempts.status = 'scored') as scored_attempt_count,
  (select count(*)
     from app.student_module_progress
     join scoped_learners
       on scoped_learners.student_id = student_module_progress.student_id
    where student_module_progress.is_complete) as completed_module_count
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

# `app.competency_mastery_summary` aggregates every learner, so a section
# cannot be asked of it. This is that view's aggregate with the section written
# into the join rather than the where clause: a competency nobody in the
# section has progress against still appears, tracking zero learners, which is
# itself the answer. With the section null it is the view.
_COMPETENCIES_SQL = """
select
  competencies.competency_id,
  competencies.code,
  competencies.name,
  competencies.domain,
  competencies.grade_id,
  competencies.status,
  count(competency_progress.progress_id) as learners_tracked,
  count(*) filter (where competency_progress.mastery_band = 'Mastered')
    as mastered_count,
  count(*) filter (where competency_progress.mastery_band = 'Developing')
    as developing_count,
  count(*) filter (where competency_progress.mastery_band = 'Needs Improvement')
    as needs_improvement_count,
  round(avg(competency_progress.current_score), 2) as average_current_score,
  round(avg(competency_progress.diagnostic_score), 2) as average_diagnostic_score
from app.competencies
left join app.competency_progress
  on competency_progress.competency_id = competencies.competency_id
  and ($2::uuid is null or competency_progress.student_id in (
        select student_profiles.student_id
        from app.student_profiles
        where student_profiles.section_id = $2))
where ($1::uuid is null or competencies.grade_id = $1)
group by
  competencies.competency_id,
  competencies.code,
  competencies.name,
  competencies.domain,
  competencies.grade_id,
  competencies.status
order by competencies.code
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


async def dashboard(
    connection: ActorConnection, *, grade_id: UUID | None, section_id: UUID | None
) -> Any:
    return await connection.fetchrow(_DASHBOARD_SQL, grade_id, section_id)


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


async def competencies(
    connection: ActorConnection, *, grade_id: UUID | None, section_id: UUID | None
) -> list[Any]:
    return await connection.fetch(_COMPETENCIES_SQL, grade_id, section_id)


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
