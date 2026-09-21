"""Data access for the filtered Reports & Analytics overview.

Every statement starts from the same cohort, `scoped_learners`, written once
here and used by each query: active accounts only, narrowed by grade, section
and monitoring status. The dashboard's figures describe the same learners with
the same definitions (see `reporting_repository`), so an unfiltered report and
the dashboard agree number for number.

Statements name their parameters (`:section`, `:start`, ...) and `_bind`
turns them into positional ones, so each statement binds only what it uses:

    :grade        uuid or null
    :section      uuid or null
    :status       monitoring status text or null
    :start        timestamptz or null, inclusive
    :until        timestamptz or null, exclusive (the day after "to")
    :competency   uuid or null

Averages are over learners: each learner's own average first, then the average
of those, so a learner with many competencies does not outweigh one with few.
Disclosure control is applied by the caller, which knows how many learners
each figure was drawn from.
"""

from __future__ import annotations

import re
from typing import Any

from modules.shared.db import ActorConnection

# S608 flags interpolation into SQL. What is interpolated below is only these
# two module constants, never a value; every value is a bound parameter.

#: The cohort. Suspended and archived accounts are not counted anywhere.
SCOPED_LEARNERS = """
scoped_learners as (
  select
    student_profiles.student_id,
    student_profiles.learner_id,
    student_profiles.section_id,
    student_profiles.monitoring_status,
    student_profiles.diagnostic_status,
    user_profiles.full_name
  from app.student_profiles
  join app.user_profiles on user_profiles.user_id = student_profiles.user_id
  where user_profiles.account_status = 'active'
    and (:grade::uuid is null or student_profiles.grade_id = :grade)
    and (:section::uuid is null or student_profiles.section_id = :section)
    and (:status::text is null or student_profiles.monitoring_status::text = :status)
)"""

#: Each learner's own averages over the competencies they have progress in.
LEARNER_AVERAGES = """
learner_averages as (
  select
    competency_progress.student_id,
    avg(competency_progress.current_score) as current_average,
    avg(competency_progress.diagnostic_score) as diagnostic_average
  from app.competency_progress
  join scoped_learners on scoped_learners.student_id = competency_progress.student_id
  group by competency_progress.student_id
)"""

_SUMMARY_SQL = f"""
with {SCOPED_LEARNERS},
{LEARNER_AVERAGES}
select
  (select count(*) from scoped_learners) as learner_count,
  (select count(*) from scoped_learners
    where monitoring_status = 'needs_intervention') as needs_support_count,
  (select count(*) from scoped_learners
    where monitoring_status = 'improving') as improving_count,
  (select count(*) from scoped_learners
    where monitoring_status = 'mastered') as mastered_count,
  (select count(*) from scoped_learners
    where diagnostic_status = 'not_started') as diagnostic_not_started,
  (select count(*) from scoped_learners
    where diagnostic_status = 'in_progress') as diagnostic_in_progress,
  (select count(*) from scoped_learners
    where diagnostic_status = 'completed') as diagnostic_completed,
  (select count(*) from learner_averages
    where current_average is not null) as learners_with_scores,
  (select round(avg(current_average), 2) from learner_averages) as average_current,
  (select round(avg(diagnostic_average), 2) from learner_averages) as average_diagnostic,
  (select count(*) from learner_averages
    where diagnostic_average is not null and current_average is not null)
    as learners_with_growth,
  (select round(avg(current_average - diagnostic_average), 2) from learner_averages
    where diagnostic_average is not null and current_average is not null)
    as average_growth,
  (select count(*) from app.competencies
    where competencies.status = 'published'
      and (:grade::uuid is null or competencies.grade_id = :grade)) as published_competency_count
"""  # noqa: S608

_SECTIONS_SQL = f"""
with {SCOPED_LEARNERS},
{LEARNER_AVERAGES}
select
  sections.section_id,
  sections.name as section_name,
  count(scoped_learners.student_id) as learner_count,
  count(*) filter (where scoped_learners.monitoring_status = 'needs_intervention')
    as needs_support_count,
  count(*) filter (where scoped_learners.monitoring_status = 'mastered') as mastered_count,
  count(*) filter (where scoped_learners.diagnostic_status = 'completed')
    as diagnostic_completed,
  count(learner_averages.current_average) as learners_with_scores,
  round(avg(learner_averages.current_average), 2) as average_current,
  round(avg(learner_averages.diagnostic_average), 2) as average_diagnostic
from app.sections
join scoped_learners on scoped_learners.section_id = sections.section_id
left join learner_averages on learner_averages.student_id = scoped_learners.student_id
where sections.is_active
group by sections.section_id, sections.name
order by sections.name
"""  # noqa: S608

# Published competencies, ordered by learning need: the most learners needing
# improvement first, then the lowest average. A competency nobody in the
# cohort has progress in is still listed, tracking zero learners.
_COMPETENCIES_SQL = f"""
with {SCOPED_LEARNERS},
progress as (
  select competency_progress.*
  from app.competency_progress
  join scoped_learners on scoped_learners.student_id = competency_progress.student_id
)
select
  competencies.competency_id,
  competencies.code,
  competencies.name,
  count(progress.progress_id) as learners_tracked,
  count(*) filter (where progress.mastery_band = 'Mastered') as mastered_count,
  count(*) filter (where progress.mastery_band = 'Developing') as developing_count,
  count(*) filter (where progress.mastery_band = 'Needs Improvement')
    as needs_improvement_count,
  round(avg(progress.current_score), 2) as average_current,
  round(avg(progress.diagnostic_score), 2) as average_diagnostic,
  app.mastery_band_for(round(avg(progress.current_score), 2)) as average_band
from app.competencies
left join progress on progress.competency_id = competencies.competency_id
where competencies.status = 'published'
  and (:grade::uuid is null or competencies.grade_id = :grade)
  and (:competency::uuid is null or competencies.competency_id = :competency)
group by competencies.competency_id, competencies.code, competencies.name
order by
  count(*) filter (where progress.mastery_band = 'Needs Improvement') desc,
  avg(progress.current_score) asc nulls last,
  competencies.code
"""  # noqa: S608

# Finished work inside the date range. Assessments are whole papers and are
# not narrowed by competency; practice activities and lessons belong to one
# competency through their module, so they are.
_ACTIVITY_SQL = f"""
with {SCOPED_LEARNERS}
select
  (select count(*)
     from app.assessment_attempts
     join scoped_learners on scoped_learners.student_id = assessment_attempts.student_id
    where assessment_attempts.status = 'scored'
      and (:start::timestamptz is null or assessment_attempts.submitted_at >= :start)
      and (:until::timestamptz is null or assessment_attempts.submitted_at < :until))
    as assessments_scored,
  (select count(distinct assessment_attempts.student_id)
     from app.assessment_attempts
     join scoped_learners on scoped_learners.student_id = assessment_attempts.student_id
    where assessment_attempts.status = 'scored'
      and (:start::timestamptz is null or assessment_attempts.submitted_at >= :start)
      and (:until::timestamptz is null or assessment_attempts.submitted_at < :until))
    as assessment_learners,
  (select round(avg(assessment_attempts.overall_score), 2)
     from app.assessment_attempts
     join scoped_learners on scoped_learners.student_id = assessment_attempts.student_id
    where assessment_attempts.status = 'scored'
      and (:start::timestamptz is null or assessment_attempts.submitted_at >= :start)
      and (:until::timestamptz is null or assessment_attempts.submitted_at < :until))
    as assessment_average,
  (select count(*)
     from app.activity_attempts
     join scoped_learners on scoped_learners.student_id = activity_attempts.student_id
     join app.activities on activities.activity_id = activity_attempts.activity_id
     join app.learning_modules on learning_modules.module_id = activities.module_id
    where activity_attempts.submitted_at is not null
      and (:competency::uuid is null or learning_modules.competency_id = :competency)
      and (:start::timestamptz is null or activity_attempts.submitted_at >= :start)
      and (:until::timestamptz is null or activity_attempts.submitted_at < :until))
    as activity_attempts,
  (select count(distinct activity_attempts.student_id)
     from app.activity_attempts
     join scoped_learners on scoped_learners.student_id = activity_attempts.student_id
     join app.activities on activities.activity_id = activity_attempts.activity_id
     join app.learning_modules on learning_modules.module_id = activities.module_id
    where activity_attempts.submitted_at is not null
      and (:competency::uuid is null or learning_modules.competency_id = :competency)
      and (:start::timestamptz is null or activity_attempts.submitted_at >= :start)
      and (:until::timestamptz is null or activity_attempts.submitted_at < :until))
    as activity_learners,
  (select count(*) filter (where activity_attempts.passed)
     from app.activity_attempts
     join scoped_learners on scoped_learners.student_id = activity_attempts.student_id
     join app.activities on activities.activity_id = activity_attempts.activity_id
     join app.learning_modules on learning_modules.module_id = activities.module_id
    where activity_attempts.submitted_at is not null
      and (:competency::uuid is null or learning_modules.competency_id = :competency)
      and (:start::timestamptz is null or activity_attempts.submitted_at >= :start)
      and (:until::timestamptz is null or activity_attempts.submitted_at < :until))
    as activity_passed,
  (select round(avg(activity_attempts.score_percentage), 2)
     from app.activity_attempts
     join scoped_learners on scoped_learners.student_id = activity_attempts.student_id
     join app.activities on activities.activity_id = activity_attempts.activity_id
     join app.learning_modules on learning_modules.module_id = activities.module_id
    where activity_attempts.submitted_at is not null
      and (:competency::uuid is null or learning_modules.competency_id = :competency)
      and (:start::timestamptz is null or activity_attempts.submitted_at >= :start)
      and (:until::timestamptz is null or activity_attempts.submitted_at < :until))
    as activity_average,
  (select count(*)
     from app.student_module_progress
     join scoped_learners
       on scoped_learners.student_id = student_module_progress.student_id
     join app.learning_modules
       on learning_modules.module_id = student_module_progress.module_id
    where student_module_progress.is_complete
      and (:competency::uuid is null or learning_modules.competency_id = :competency)
      and (:start::timestamptz is null or student_module_progress.completed_at >= :start)
      and (:until::timestamptz is null or student_module_progress.completed_at < :until))
    as modules_completed
"""  # noqa: S608

# Graded answers, from diagnostics and practice alike, per question. Only a
# question answered by enough different learners is returned at all, so a
# question's miss rate is never a statement about one child.
# Practice answers' correctness is not readable directly, by design, so the
# per-question totals come from `app.report_question_misses`, which returns
# counts only. Only a question answered by enough different learners is
# returned at all, so a miss rate is never a statement about one child.
_MOST_MISSED_SQL = f"""
with {SCOPED_LEARNERS},
per_question as (
  select *
  from app.report_question_misses(
    array(select scoped_learners.student_id from scoped_learners),
    :start::timestamptz,
    :until::timestamptz,
    :competency::uuid
  )
)
select
  per_question.question_id,
  per_question.competency_id,
  competencies.code as competency_code,
  competencies.name as competency_name,
  questions.prompt,
  questions.choices,
  per_question.learners_answered,
  per_question.answered,
  per_question.incorrect,
  per_question.common_wrong_answer,
  per_question.common_wrong_times
from per_question
join app.questions on questions.question_id = per_question.question_id
left join app.competencies on competencies.competency_id = per_question.competency_id
where per_question.learners_answered >= :min_learners
  and per_question.incorrect > 0
order by
  per_question.incorrect::numeric / per_question.answered desc,
  per_question.incorrect desc,
  competencies.code,
  per_question.question_id
limit :limit
"""  # noqa: S608

# Cases for the cohort: where they stand now, and what happened in the range.
_INTERVENTIONS_SQL = f"""
with {SCOPED_LEARNERS},
cases as (
  select interventions.*
  from app.interventions
  join scoped_learners on scoped_learners.student_id = interventions.student_id
  where interventions.archived_at is null
    and (:competency::uuid is null or interventions.competency_id = :competency)
)
select
  (select count(*) from cases where status = 'Needs Intervention') as needs_intervention,
  (select count(*) from cases where status = 'In Progress') as in_progress,
  (select count(*) from cases where status = 'Resolved') as resolved,
  (select count(*) from cases
    where (:start::timestamptz is null or created_at >= :start)
      and (:until::timestamptz is null or created_at < :until)) as opened_in_range,
  (select count(*) from cases
    where status = 'Resolved' and resolved_at is not null
      and (:start::timestamptz is null or resolved_at >= :start)
      and (:until::timestamptz is null or resolved_at < :until)) as resolved_in_range,
  (select round(
            (percentile_cont(0.5) within group (
              order by extract(epoch from resolved_at - created_at) / 86400.0
            ))::numeric, 1)
     from cases
    where status = 'Resolved' and resolved_at is not null
      and (:start::timestamptz is null or resolved_at >= :start)
      and (:until::timestamptz is null or resolved_at < :until)) as median_days_to_resolve
"""  # noqa: S608

# The learners to watch, paged: those the rules say need support, and those
# with a case still open. The same rule as `/teacher-admin/students/at-risk`.
_WATCH_SQL = f"""
with {SCOPED_LEARNERS},
{LEARNER_AVERAGES},
open_cases as (
  select interventions.student_id, count(*) as open_count
  from app.interventions
  join scoped_learners on scoped_learners.student_id = interventions.student_id
  where interventions.archived_at is null
    and interventions.status <> 'Resolved'
  group by interventions.student_id
),
watched as (
  select
    scoped_learners.student_id,
    scoped_learners.learner_id,
    scoped_learners.full_name,
    sections.name as section_name,
    scoped_learners.monitoring_status,
    round(learner_averages.diagnostic_average, 2) as diagnostic_average,
    round(learner_averages.current_average, 2) as current_average,
    coalesce(open_cases.open_count, 0) as open_intervention_count
  from scoped_learners
  left join app.sections on sections.section_id = scoped_learners.section_id
  left join learner_averages on learner_averages.student_id = scoped_learners.student_id
  left join open_cases on open_cases.student_id = scoped_learners.student_id
  where (scoped_learners.monitoring_status = 'needs_intervention'
         or open_cases.open_count > 0)
)
select watched.*, count(*) over () as total
from watched
order by
  watched.open_intervention_count desc,
  watched.current_average asc nulls last,
  watched.learner_id
limit :limit offset :offset
"""  # noqa: S608


# One row per learner in the cohort, with the same per-learner averages the
# overview reports, for the CSV export.
_EXPORT_SQL = f"""
with {SCOPED_LEARNERS},
{LEARNER_AVERAGES}
select
  scoped_learners.learner_id,
  sections.name as section_name,
  scoped_learners.full_name,
  scoped_learners.diagnostic_status,
  round(learner_averages.diagnostic_average, 2) as diagnostic_average,
  round(learner_averages.current_average, 2) as current_average,
  (select count(*) from app.competency_progress
    where competency_progress.student_id = scoped_learners.student_id
      and competency_progress.mastery_band = 'Mastered') as competencies_mastered,
  (select count(*) from app.student_module_progress
    where student_module_progress.student_id = scoped_learners.student_id
      and student_module_progress.is_complete) as modules_completed,
  scoped_learners.monitoring_status,
  (select count(*) from app.interventions
    where interventions.student_id = scoped_learners.student_id
      and interventions.archived_at is null
      and interventions.status <> 'Resolved') as open_intervention_count
from scoped_learners
left join app.sections on sections.section_id = scoped_learners.section_id
left join learner_averages on learner_averages.student_id = scoped_learners.student_id
order by sections.name nulls last, scoped_learners.learner_id
limit :limit
"""  # noqa: S608


_NAME = re.compile(r"(?<!:):([a-z_]+)(?![a-z_])")


def _bind(sql: str, values: dict[str, Any]) -> tuple[str, list[Any]]:
    """Named placeholders to positional ones, numbered by first appearance."""
    order: list[str] = []

    def number(match: re.Match[str]) -> str:
        name = match.group(1)
        if name not in order:
            order.append(name)
        return f"${order.index(name) + 1}"

    return _NAME.sub(number, sql), [values[name] for name in order]


def _values(filters: dict[str, Any], **extra: Any) -> dict[str, Any]:
    return {
        "grade": filters.get("grade_id"),
        "section": filters.get("section_id"),
        "status": filters.get("status"),
        "start": filters.get("start"),
        "until": filters.get("until"),
        "competency": filters.get("competency_id"),
        **extra,
    }


async def _fetch(connection: ActorConnection, sql: str, values: dict[str, Any]) -> list[Any]:
    statement, args = _bind(sql, values)
    return await connection.fetch(statement, *args)


async def _fetchrow(connection: ActorConnection, sql: str, values: dict[str, Any]) -> Any:
    statement, args = _bind(sql, values)
    return await connection.fetchrow(statement, *args)


async def summary(connection: ActorConnection, filters: dict[str, Any]) -> Any:
    return await _fetchrow(connection, _SUMMARY_SQL, _values(filters))


async def sections(connection: ActorConnection, filters: dict[str, Any]) -> list[Any]:
    return await _fetch(connection, _SECTIONS_SQL, _values(filters))


async def competencies(connection: ActorConnection, filters: dict[str, Any]) -> list[Any]:
    return await _fetch(connection, _COMPETENCIES_SQL, _values(filters))


async def activity(connection: ActorConnection, filters: dict[str, Any]) -> Any:
    return await _fetchrow(connection, _ACTIVITY_SQL, _values(filters))


async def most_missed(
    connection: ActorConnection, filters: dict[str, Any], *, min_learners: int, limit: int
) -> list[Any]:
    return await _fetch(
        connection, _MOST_MISSED_SQL, _values(filters, min_learners=min_learners, limit=limit)
    )


async def interventions(connection: ActorConnection, filters: dict[str, Any]) -> Any:
    return await _fetchrow(connection, _INTERVENTIONS_SQL, _values(filters))


async def watch_list(
    connection: ActorConnection, filters: dict[str, Any], *, limit: int, offset: int
) -> list[Any]:
    return await _fetch(connection, _WATCH_SQL, _values(filters, limit=limit, offset=offset))


async def export_rows(
    connection: ActorConnection, filters: dict[str, Any], *, limit: int
) -> list[Any]:
    return await _fetch(connection, _EXPORT_SQL, _values(filters, limit=limit))
