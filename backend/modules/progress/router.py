"""Progress routes.

`/progress/me` and `/progress/{student_id}` build the same answer from the same
statements. Who may ask about whom is decided here and again by the policies:
a learner may name only themselves, and `security_invoker` on the reporting view
means that even if this check were wrong, the view would still resolve to their
own row.

Growth is `current - diagnostic`. The recommended next action is the first
available item of the learner's own path. Neither consults Groq.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter

from app.dependencies import ActorDb, CurrentActor
from middleware.auth import MathSmartRole
from middleware.errors import ApiError
from modules.progress import repository
from modules.progress.schemas import (
    CompetencyProgress,
    LearnerProgress,
    RecentActivity,
    TrajectoryPoint,
)

router = APIRouter(tags=["progress"])

RECENT_ACTIVITY_LIMIT = 10


def _number(value: Any) -> float | None:
    return None if value is None else float(value)


def _growth(current: Any, diagnostic: Any) -> float | None:
    """A subtraction, and nothing but, so a dashboard cannot disagree with a report."""
    if current is None or diagnostic is None:
        return None
    return round(float(current) - float(diagnostic), 2)


def _next_action(path_rows: list[Any]) -> dict[str, Any]:
    for row in path_rows:
        if str(row["status"]) in {"available", "in_progress"}:
            return {
                "type": "module",
                "resource_id": str(row["module_id"]),
                "label": f"Continue {row['module_title']}",
            }
    return {"type": "dashboard", "resource_id": None, "label": "Return to Dashboard"}


async def _progress_for(connection: Any, student_id: UUID) -> dict[str, Any]:
    summary = await repository.summary(connection, student_id)
    if summary is None:
        raise ApiError(404, "No learner record was found")

    competency_rows = await repository.competencies(connection, student_id)
    path_rows = await repository.path(connection, student_id)
    trajectory_rows = await repository.trajectory(connection, student_id)
    total_modules = await repository.published_module_total(connection)

    by_competency: dict[str, list[TrajectoryPoint]] = {}
    for row in trajectory_rows:
        by_competency.setdefault(str(row["competency_id"]), []).append(
            TrajectoryPoint(
                date=row["occurred_at"], score=_number(row["score"]), label=row["label"]
            )
        )

    progress = LearnerProgress(
        student_id=summary["student_id"],
        overall_mastery=_number(summary["current_average"]),
        diagnostic_score=_number(summary["diagnostic_average"]),
        growth=_growth(summary["current_average"], summary["diagnostic_average"]),
        modules_completed_count=summary["modules_completed"] or 0,
        total_modules_count=total_modules,
        active_intervention_count=summary["open_intervention_count"] or 0,
        monitoring_status=(
            str(summary["monitoring_status"]) if summary["monitoring_status"] else None
        ),
        recommended_next_action=_next_action(list(path_rows)),
        competencies=[
            CompetencyProgress(
                competency_id=row["competency_id"],
                competency_code=row["competency_code"],
                competency_name=row["competency_name"],
                diagnostic_score=_number(row["diagnostic_score"]),
                current_score=_number(row["current_score"]),
                growth=_growth(row["current_score"], row["diagnostic_score"]),
                mastery_band=str(row["mastery_band"]) if row["mastery_band"] else None,
                attempt_count=row["attempt_count"] or 0,
                unsuccessful_attempts=row["unsuccessful_attempts"] or 0,
                trajectory=by_competency.get(str(row["competency_id"]), []),
            )
            for row in competency_rows
        ],
        recent_activity=[
            RecentActivity(
                date=row["occurred_at"],
                label=row["label"],
                score=_number(row["score"]),
                resource_id=row["activity_id"],
                title=row["title"],
            )
            for row in list(trajectory_rows)[-RECENT_ACTIVITY_LIMIT:][::-1]
        ],
    )
    return {"data": progress.model_dump(mode="json")}


@router.get("/progress/me")
async def read_own_progress(actor: CurrentActor, connection: ActorDb) -> dict[str, Any]:
    """The caller's own progress. No learner identifier is read from the request."""
    student_id = await repository.own_student_id(connection, actor.user_id)
    if student_id is None:
        raise ApiError(403, "This action belongs to a learner")
    return await _progress_for(connection, student_id)


@router.get("/progress/{student_id}")
async def read_progress(
    actor: CurrentActor, connection: ActorDb, student_id: UUID
) -> dict[str, Any]:
    """A named learner's progress: their own, or any learner for an educator."""
    if actor.role is not MathSmartRole.TEACHER_ADMIN:
        own = await repository.own_student_id(connection, actor.user_id)
        if own is None or UUID(str(own)) != student_id:
            raise ApiError(403, "This learner record does not belong to you")
    return await _progress_for(connection, student_id)
