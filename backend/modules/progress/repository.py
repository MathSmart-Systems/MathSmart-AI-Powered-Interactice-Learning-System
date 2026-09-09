"""Data access for the progress module.

The per-learner rollup comes from `app.student_performance_summary`, which is a
`security_invoker` view: a learner reading it resolves only their own row, and a
Teacher/Administrator resolves the school's. The view is the same either way, so
there is no second code path to keep honest.

The trajectory is assembled from the learner's own attempt history rather than
stored, so it cannot drift from the records it describes.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from modules.shared.db import ActorConnection

_OWN_STUDENT_SQL = """
select student_profiles.student_id
from app.student_profiles
where student_profiles.user_id = $1
"""

_SUMMARY_SQL = """
select
  student_performance_summary.student_id,
  student_performance_summary.learner_id,
  student_performance_summary.full_name,
  student_performance_summary.grade_id,
  student_performance_summary.section_id,
  student_performance_summary.monitoring_status,
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
where student_performance_summary.student_id = $1
"""

_COMPETENCIES_SQL = """
select
  competency_progress.competency_id,
  competencies.code as competency_code,
  competencies.name as competency_name,
  competency_progress.diagnostic_score,
  competency_progress.current_score,
  competency_progress.mastery_band,
  competency_progress.attempt_count,
  competency_progress.unsuccessful_attempts,
  competency_progress.last_studied_at
from app.competency_progress
join app.competencies
  on competencies.competency_id = competency_progress.competency_id
where competency_progress.student_id = $1
order by competency_progress.current_score nulls first, competencies.code
"""

_PATH_SQL = """
select
  learning_path_items.path_item_id,
  learning_path_items.priority,
  learning_path_items.status,
  learning_path_items.module_id,
  learning_modules.title as module_title,
  learning_path_items.competency_id
from app.learning_path_items
join app.learning_modules
  on learning_modules.module_id = learning_path_items.module_id
where learning_path_items.student_id = $1
order by learning_path_items.priority
"""

# Two kinds of evidence, one ordered series: what the diagnostic and any later
# assessment recorded per competency, and every scored activity attempt.
_TRAJECTORY_SQL = """
select
  competency_results.competency_id,
  assessment_attempts.submitted_at as occurred_at,
  competency_results.percentage as score,
  initcap(replace(assessments.assessment_type::text, '_', ' ')) as label,
  null::uuid as activity_id,
  assessments.title
from app.competency_results
join app.assessment_attempts
  on assessment_attempts.attempt_id = competency_results.attempt_id
join app.assessments
  on assessments.assessment_id = assessment_attempts.assessment_id
where assessment_attempts.student_id = $1
union all
select
  learning_modules.competency_id,
  activity_attempts.submitted_at as occurred_at,
  activity_attempts.score_percentage as score,
  'Activity Attempt ' || activity_attempts.attempt_number as label,
  activity_attempts.activity_id,
  activities.title
from app.activity_attempts
join app.activities on activities.activity_id = activity_attempts.activity_id
join app.learning_modules on learning_modules.module_id = activities.module_id
where activity_attempts.student_id = $1
  and activity_attempts.status = 'scored'
order by occurred_at
"""

_MODULE_TOTAL_SQL = """
select count(*) as total_modules
from app.learning_modules
where learning_modules.status = 'published'
"""


async def own_student_id(connection: ActorConnection, user_id: UUID) -> Any:
    return await connection.fetchval(_OWN_STUDENT_SQL, user_id)


async def summary(connection: ActorConnection, student_id: UUID) -> Any:
    return await connection.fetchrow(_SUMMARY_SQL, student_id)


async def competencies(connection: ActorConnection, student_id: UUID) -> list[Any]:
    return await connection.fetch(_COMPETENCIES_SQL, student_id)


async def path(connection: ActorConnection, student_id: UUID) -> list[Any]:
    return await connection.fetch(_PATH_SQL, student_id)


async def trajectory(connection: ActorConnection, student_id: UUID) -> list[Any]:
    return await connection.fetch(_TRAJECTORY_SQL, student_id)


async def published_module_total(connection: ActorConnection) -> int:
    return await connection.fetchval(_MODULE_TOTAL_SQL) or 0
