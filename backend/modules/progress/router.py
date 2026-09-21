"""Progress routes.

`/progress/me` and `/progress/{student_id}` build the same answer from the same
statements. Who may ask about whom is decided here and again by the policies:
a learner may name only themselves, and `security_invoker` on the reporting view
means that even if this check were wrong, the view would still resolve to their
own row.

Growth is `current - diagnostic`. The recommended next action is the first
available item of the learner's own path. Neither consults Groq.

The counts a learner is shown are pairs, and each pair is drawn from one set:
mastery is counted against the competencies published for their grade, and
module completion against the modules their own path assigns. The mastered
figure stays the database's — `app.mastery_band_for` decides a band, and this
module only reports how many rows it landed on.
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
    """Where the learner goes next, named by `type` so no client has to read the label.

    The three types are the three states a path can be in, and each names a
    different destination: an open module, a finished path, or no path at all.
    A client that routed on the label instead would send a learner who has
    finished everything to the same screen as a learner who has not started.

    A non-empty path with nothing open can only mean every item is finished.
    `app.refresh_learning_path` opens the lowest-priority unfinished item
    whenever the ones before it are done, so "nothing available" and "something
    left to do" cannot both be true.
    """
    for row in path_rows:
        if str(row["status"]) in {"available", "in_progress"}:
            return {
                "type": "module",
                "resource_id": str(row["module_id"]),
                "label": f"Continue {row['module_title']}",
            }
    if path_rows:
        return {
            "type": "path_complete",
            "resource_id": None,
            "label": "You have finished every module in your learning path",
        }
    # The diagnostic is the only thing that writes a learning path, so a learner
    # without one has nothing to continue and is not being sent somewhere
    # arbitrary — they are being sent to the step that builds their path.
    return {
        "type": "diagnostic",
        "resource_id": None,
        "label": "Take your diagnostic assessment to build your learning path",
    }


async def _progress_for(connection: Any, student_id: UUID) -> dict[str, Any]:
    summary = await repository.summary(connection, student_id)
    if summary is None:
        raise ApiError(404, "No learner record was found")

    competency_rows = await repository.competencies(connection, student_id)
    path_rows = await repository.path(connection, student_id)
    trajectory_rows = await repository.trajectory(connection, student_id)
    total_competencies = await repository.published_competency_total(connection, student_id)
    total_modules, modules_completed = await repository.path_module_totals(connection, student_id)

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
        modules_completed_count=modules_completed,
        total_modules_count=total_modules,
        competencies_mastered_count=summary["competencies_mastered"] or 0,
        total_competencies_count=total_competencies,
        scored_attempt_count=summary["scored_attempt_count"] or 0,
        worst_unsuccessful_attempts=summary["worst_unsuccessful_attempts"] or 0,
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


def _path_item(row: Any) -> dict[str, Any]:
    return {
        "id": str(row["path_item_id"]),
        "priority": row["priority"],
        "reason": row["reason"],
        "status": str(row["status"]),
        "competency": {
            "id": str(row["competency_id"]),
            "code": row["competency_code"],
            "name": row["competency_name"],
        },
        "module": {
            "id": str(row["module_id"]),
            "title": row["module_title"],
            "estimated_minutes": row["estimated_minutes"],
        },
    }


async def _own_student_id(connection: Any, actor: Any) -> UUID:
    """The caller's own learner record, or a refusal. No request field names it."""
    student_id = await repository.own_student_id(connection, actor.user_id)
    if student_id is None:
        raise ApiError(403, "This action belongs to a learner")
    return UUID(str(student_id))


async def _may_name(connection: Any, actor: Any, student_id: UUID) -> None:
    """A learner may name only themselves; naming anyone is an educator's action."""
    if actor.role is MathSmartRole.TEACHER_ADMIN:
        return
    own = await repository.own_student_id(connection, actor.user_id)
    if own is None or UUID(str(own)) != student_id:
        raise ApiError(403, "This learner record does not belong to you")


@router.get("/learning-path/me")
async def read_own_learning_path(actor: CurrentActor, connection: ActorDb) -> dict[str, Any]:
    """The caller's own ordered targeted path."""
    student_id = await _own_student_id(connection, actor)
    rows = await repository.path(connection, student_id)
    return {"data": [_path_item(row) for row in rows]}


@router.get("/learning-path/{student_id}")
async def read_learning_path(
    actor: CurrentActor, connection: ActorDb, student_id: UUID
) -> dict[str, Any]:
    """A named learner's ordered path, with the reason each item was recommended."""
    await _may_name(connection, actor, student_id)
    rows = await repository.path(connection, student_id)
    return {"data": [_path_item(row) for row in rows]}


@router.get("/progress/me")
async def read_own_progress(actor: CurrentActor, connection: ActorDb) -> dict[str, Any]:
    """The caller's own progress. No learner identifier is read from the request.

    `active_intervention_count` is replaced here with the learner's own count.
    The shared summary reads it through a `security_invoker` view, and a
    learner cannot see intervention rows, so for a learner that figure is 0
    however much help they are getting. The replacement is one integer from a
    function that answers for the caller only and carries no severity, reason,
    note or status — the dashboard shows it as a supportive notice and nothing
    more.
    """
    student_id = await _own_student_id(connection, actor)
    body = await _progress_for(connection, student_id)
    body["data"]["active_intervention_count"] = await repository.own_support_count(connection)
    return body


@router.get("/progress/{student_id}")
async def read_progress(
    actor: CurrentActor, connection: ActorDb, student_id: UUID
) -> dict[str, Any]:
    """A named learner's progress: their own, or any learner for an educator."""
    await _may_name(connection, actor, student_id)
    return await _progress_for(connection, student_id)
