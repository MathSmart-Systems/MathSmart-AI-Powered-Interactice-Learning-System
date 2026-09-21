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
  join app.user_profiles on user_profiles.user_id = student_profiles.user_id
  where user_profiles.account_status = 'active'
    and ($1::uuid is null or student_profiles.grade_id = $1)
    and ($2::uuid is null or student_profiles.section_id = $2)
),
learner_averages as (
  select competency_progress.student_id,
         avg(competency_progress.current_score) as current_average
  from app.competency_progress
  join scoped_learners on scoped_learners.student_id = competency_progress.student_id
  group by competency_progress.student_id
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
  -- Over learners, not over progress rows, so a learner with many
  -- competencies does not outweigh one with few. Reports use the same.
  (select round(avg(learner_averages.current_average), 2) from learner_averages)
    as average_mastery,
  (select count(*) from learner_averages
    where learner_averages.current_average is not null) as learners_with_scores,
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

# The four figures the dashboard reports beside its totals. Each is scoped to
# the same learners as `_DASHBOARD_SQL`, named once in `scoped_learners`, so a
# section filter narrows every number on the page together.
_DASHBOARD_BREAKDOWN_SQL = """
with scoped_learners as (
  select student_profiles.student_id, student_profiles.diagnostic_status
  from app.student_profiles
  join app.user_profiles on user_profiles.user_id = student_profiles.user_id
  where user_profiles.account_status = 'active'
    and ($1::uuid is null or student_profiles.grade_id = $1)
    and ($2::uuid is null or student_profiles.section_id = $2)
)
select
  (select count(*) from app.sections
    where sections.is_active
      and ($1::uuid is null or sections.grade_id = $1)
      and ($2::uuid is null or sections.section_id = $2)) as section_count,
  (select count(*) from scoped_learners
    where scoped_learners.diagnostic_status = 'not_started') as diagnostic_not_started,
  (select count(*) from scoped_learners
    where scoped_learners.diagnostic_status = 'in_progress') as diagnostic_in_progress,
  (select count(*) from scoped_learners
    where scoped_learners.diagnostic_status = 'completed') as diagnostic_completed,
  (select count(*) from app.interventions
     join scoped_learners on scoped_learners.student_id = interventions.student_id
    where interventions.archived_at is null
      and interventions.status = 'Needs Intervention') as interventions_needs_intervention,
  (select count(*) from app.interventions
     join scoped_learners on scoped_learners.student_id = interventions.student_id
    where interventions.archived_at is null
      and interventions.status = 'In Progress') as interventions_in_progress,
  (select count(*) from app.interventions
     join scoped_learners on scoped_learners.student_id = interventions.student_id
    where interventions.archived_at is null
      and interventions.status = 'Resolved') as interventions_resolved
"""

# The most recent finished work across the cohort: scored assessments and
# completed modules, newest first. The score is the one the database already
# recorded; nothing here re-derives it.
_RECENT_ACTIVITY_SQL = """
with scoped_learners as (
  select student_profiles.student_id, student_profiles.learner_id,
         user_profiles.full_name
  from app.student_profiles
  join app.user_profiles on user_profiles.user_id = student_profiles.user_id
  where user_profiles.account_status = 'active'
    and ($1::uuid is null or student_profiles.grade_id = $1)
    and ($2::uuid is null or student_profiles.section_id = $2)
),
activity as (
  select
    'assessment' as kind,
    assessment_attempts.attempt_id as activity_id,
    scoped_learners.student_id,
    scoped_learners.learner_id,
    scoped_learners.full_name,
    assessments.title,
    assessment_attempts.overall_score as score,
    assessment_attempts.submitted_at as occurred_at
  from app.assessment_attempts
  join scoped_learners on scoped_learners.student_id = assessment_attempts.student_id
  join app.assessments on assessments.assessment_id = assessment_attempts.assessment_id
  where assessment_attempts.status = 'scored'
    and assessment_attempts.submitted_at is not null
  union all
  select
    'module' as kind,
    student_module_progress.progress_id as activity_id,
    scoped_learners.student_id,
    scoped_learners.learner_id,
    scoped_learners.full_name,
    learning_modules.title,
    null::numeric as score,
    student_module_progress.completed_at as occurred_at
  from app.student_module_progress
  join scoped_learners on scoped_learners.student_id = student_module_progress.student_id
  join app.learning_modules
    on learning_modules.module_id = student_module_progress.module_id
  where student_module_progress.is_complete
)
select * from activity
order by occurred_at desc
limit $3
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
join app.user_profiles on user_profiles.user_id = student_profiles.user_id
left join app.sections on sections.section_id = student_performance_summary.section_id
where user_profiles.account_status = 'active'
  and ($1::uuid is null or student_performance_summary.grade_id = $1)
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
  round(avg(competency_progress.diagnostic_score), 2) as average_diagnostic_score,
  -- The band the database would give this average. `app.mastery_band_for` is
  -- the only definition of a band; a caller that drew its own thresholds had
  -- already drifted from it once.
  app.mastery_band_for(round(avg(competency_progress.current_score), 2))
    as average_mastery_band
from app.competencies
left join app.competency_progress
  on competency_progress.competency_id = competencies.competency_id
  and competency_progress.student_id in (
        select student_profiles.student_id
        from app.student_profiles
        join app.user_profiles on user_profiles.user_id = student_profiles.user_id
        where user_profiles.account_status = 'active'
          and ($2::uuid is null or student_profiles.section_id = $2))
where ($1::uuid is null or competencies.grade_id = $1)
  -- A draft is not taught yet and an archived competency no longer is, so a
  -- class summary that lists them describes a curriculum nobody is following.
  and (not $3::boolean or competencies.status = 'published')
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
    connection: ActorConnection,
    *,
    grade_id: UUID | None,
    section_id: UUID | None,
    published_only: bool = False,
) -> list[Any]:
    return await connection.fetch(_COMPETENCIES_SQL, grade_id, section_id, published_only)


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


async def dashboard_breakdown(
    connection: ActorConnection, *, grade_id: UUID | None, section_id: UUID | None
) -> Any:
    return await connection.fetchrow(_DASHBOARD_BREAKDOWN_SQL, grade_id, section_id)


async def recent_activity(
    connection: ActorConnection,
    *,
    grade_id: UUID | None,
    section_id: UUID | None,
    limit: int,
) -> list[Any]:
    return await connection.fetch(_RECENT_ACTIVITY_SQL, grade_id, section_id, limit)
