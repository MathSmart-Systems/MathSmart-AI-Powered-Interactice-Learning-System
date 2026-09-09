"""Learning module routes.

Reads are shared: both roles run the same statements and the policies decide
what comes back. Writes are a learner's own, and they go through
`app.save_module_progress` and `app.complete_module` rather than a table grant,
so the learner is taken from `auth.uid()` and the completion percentage is the
database's answer rather than the caller's claim.
"""

from __future__ import annotations

from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Query

from app.dependencies import ActorDb, CurrentActor
from middleware.auth import MathSmartRole
from middleware.errors import ApiError
from modules.competencies.schemas import PublicationStatus
from modules.learning_modules import repository, service
from modules.learning_modules.schemas import (
    ActivitySummary,
    ModuleDetail,
    ModuleProgress,
    ModuleSummary,
    SaveModuleProgressRequest,
)

router = APIRouter(tags=["modules"])

MAX_PAGE_SIZE = 100
DEFAULT_PAGE_SIZE = 20
MAX_SEARCH_LENGTH = 120


def _percentage(value: Any) -> int:
    """The column is numeric(5,2); the contract reports whole percent."""
    return 0 if value is None else round(float(value))


def _summary(row: Any) -> dict[str, Any]:
    return ModuleSummary(
        id=row["module_id"],
        competency_id=row["competency_id"],
        competency_name=row["competency_name"],
        grade_id=row["grade_id"],
        title=row["title"],
        estimated_minutes=row["estimated_minutes"],
        status=str(row["status"]),
        order_index=row["order_index"],
        path_status=str(row["path_status"]) if row["path_status"] else None,
        completion_percentage=_percentage(row["completion_percentage"]),
        is_complete=bool(row["is_complete"]),
    ).model_dump(mode="json")


def _progress(row: Any) -> ModuleProgress:
    return ModuleProgress(
        completion_percentage=_percentage(row["completion_percentage"]),
        is_complete=bool(row["is_complete"]),
        completed_section_ids=[
            str(section) for section in service.as_list(row["completed_section_ids"])
        ],
        last_section_id=row["last_section_id"],
        started_at=row["started_at"],
        completed_at=row["completed_at"],
    )


def _only_a_learner(actor: Any) -> None:
    if actor.role is not MathSmartRole.STUDENT:
        raise ApiError(403, "This action belongs to a learner")


@router.get("/modules")
async def list_modules(
    actor: CurrentActor,
    connection: ActorDb,
    competency_id: Annotated[UUID | None, Query()] = None,
    grade_id: Annotated[UUID | None, Query()] = None,
    status: Annotated[PublicationStatus | None, Query()] = None,
    search: Annotated[str | None, Query(max_length=MAX_SEARCH_LENGTH)] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = DEFAULT_PAGE_SIZE,
) -> dict[str, Any]:
    """The module catalogue, carrying the caller's own path status and progress."""
    offset = (page - 1) * page_size
    filters = {
        "user_id": actor.user_id,
        "competency_id": competency_id,
        "grade_id": grade_id,
        "status": status.value if status else None,
        "search": search,
    }
    rows = await repository.listing(connection, limit=page_size, offset=offset, **filters)
    total = await repository.listing_total(connection, **filters)

    return {
        "data": [_summary(row) for row in rows],
        "meta": {
            "page": page,
            "page_size": page_size,
            "total_items": total,
            "total_pages": (total + page_size - 1) // page_size if page_size else 0,
        },
    }


@router.get("/modules/{module_id}")
async def read_module(
    actor: CurrentActor, connection: ActorDb, module_id: UUID
) -> dict[str, Any]:
    """One module, with its rules, worked examples, activities and section list."""
    row = await repository.learning_module(
        connection, user_id=actor.user_id, module_id=module_id
    )
    if row is None:
        raise ApiError(404, "No learning module was found")

    activities = await repository.activities_for(connection, module_id)

    progress = None
    if actor.role is MathSmartRole.STUDENT:
        progress_row = await repository.own_progress(
            connection, module_id=module_id, user_id=actor.user_id
        )
        if progress_row is not None:
            progress = _progress(progress_row)

    detail = ModuleDetail(
        **_summary(row),
        learning_objective=row["learning_objective"],
        short_explanation=row["short_explanation"],
        rules=service.as_list(row["rules"]),
        worked_examples=service.as_list(row["worked_examples"]),
        associated_activities=[
            ActivitySummary(
                id=activity["activity_id"],
                title=activity["title"],
                status=str(activity["status"]),
            )
            for activity in activities
        ],
        section_ids=service.section_ids(
            rules=row["rules"], worked_examples=row["worked_examples"]
        ),
        progress=progress,
    )
    return {"data": detail.model_dump(mode="json")}


@router.patch("/modules/{module_id}/progress")
async def save_module_progress(
    actor: CurrentActor,
    connection: ActorDb,
    module_id: UUID,
    body: SaveModuleProgressRequest,
) -> dict[str, Any]:
    """Autosave section progress for the calling learner.

    The request says which sections are finished. It does not say whose they
    are, and it does not say what that adds up to.
    """
    _only_a_learner(actor)

    row = await repository.save_progress(
        connection,
        module_id=module_id,
        completed_section_ids=body.completed_section_ids,
        last_section_id=body.last_section_id,
    )
    if row is None:
        raise ApiError(404, "No learning module was found")
    return {"data": _progress(row).model_dump(mode="json")}


@router.post("/modules/{module_id}/complete")
async def complete_module(
    actor: CurrentActor, connection: ActorDb, module_id: UUID
) -> dict[str, Any]:
    """Mark a module complete, once every section is finished."""
    _only_a_learner(actor)

    row = await repository.complete(connection, module_id=module_id)
    if row is None:
        raise ApiError(
            412,
            "Every section of this module must be finished first",
            code="sections_incomplete",
        )
    return {"data": _progress(row).model_dump(mode="json")}


@router.get("/modules/{module_id}/progress/{student_id}")
async def read_module_progress(
    actor: CurrentActor, connection: ActorDb, module_id: UUID, student_id: UUID
) -> dict[str, Any]:
    """A named learner's progress in a module.

    A learner reads their own through `GET /modules/{module_id}`; naming a
    learner here is a Teacher/Administrator's action, and the policies refuse it
    a second time if this check is ever wrong.
    """
    if actor.role is not MathSmartRole.TEACHER_ADMIN:
        raise ApiError(403, "This action requires a Teacher/Administrator")

    row = await repository.progress_for_student(
        connection, module_id=module_id, student_id=student_id
    )
    if row is None:
        raise ApiError(404, "No progress was found for that learner and module")
    return {"data": _progress(row).model_dump(mode="json")}
