"""Competency routes.

Both roles read the curriculum through the same statements. A learner sees
published competencies and a Teacher/Administrator sees every state, because
the policies on `app.competencies` say so — there is no role branch here that
decides visibility. The one role-dependent piece is progress, which belongs to
a learner and has no meaning for a Teacher/Administrator reading the catalogue.
"""

from __future__ import annotations

import json
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Query

from app.dependencies import ActorDb, CurrentActor
from middleware.auth import MathSmartRole
from middleware.errors import ApiError
from modules.competencies import repository
from modules.competencies.schemas import (
    CompetencyDetail,
    CompetencyProgress,
    CompetencySummary,
    ModuleSummary,
    PublicationStatus,
)

router = APIRouter(tags=["competencies"])

MAX_PAGE_SIZE = 100
DEFAULT_PAGE_SIZE = 20
MAX_SEARCH_LENGTH = 120


def _prerequisites(value: Any) -> list[str]:
    """`prerequisite_ids` is jsonb, which asyncpg hands back as text."""
    if value is None:
        return []
    if isinstance(value, str):
        value = json.loads(value)
    return [str(item) for item in value]


def _summary(row: Any) -> dict[str, Any]:
    return CompetencySummary(
        id=row["competency_id"],
        code=row["code"],
        grade_id=row["grade_id"],
        domain=row["domain"],
        name=row["name"],
        description=row["description"],
        status=str(row["status"]),
        prerequisite_ids=_prerequisites(row["prerequisite_ids"]),
    ).model_dump(mode="json")


@router.get("/competencies")
async def list_competencies(
    _actor: CurrentActor,
    connection: ActorDb,
    grade_id: Annotated[UUID | None, Query()] = None,
    domain: Annotated[str | None, Query(max_length=120)] = None,
    status: Annotated[PublicationStatus | None, Query()] = None,
    search: Annotated[str | None, Query(max_length=MAX_SEARCH_LENGTH)] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = DEFAULT_PAGE_SIZE,
) -> dict[str, Any]:
    """The competency catalogue, with the documented filters."""
    offset = (page - 1) * page_size
    filters = {
        "grade_id": grade_id,
        "domain": domain,
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


@router.get("/competencies/{competency_id}")
async def read_competency(
    actor: CurrentActor, connection: ActorDb, competency_id: UUID
) -> dict[str, Any]:
    """One competency, its modules, and the caller's own progress on it.

    A competency the caller may not see returns 404, the same as one that does
    not exist: the difference is not the caller's to learn.
    """
    row = await repository.competency(connection, competency_id)
    if row is None:
        raise ApiError(404, "No competency was found")

    modules = await repository.modules_for(connection, competency_id)

    progress = None
    if actor.role is MathSmartRole.STUDENT:
        progress_row = await repository.own_progress(connection, competency_id, actor.user_id)
        if progress_row is not None:
            progress = CompetencyProgress(
                diagnostic_score=progress_row["diagnostic_score"],
                current_score=progress_row["current_score"],
                mastery_band=(
                    str(progress_row["mastery_band"]) if progress_row["mastery_band"] else None
                ),
                attempt_count=progress_row["attempt_count"],
                last_studied_at=progress_row["last_studied_at"],
            )

    detail = CompetencyDetail(
        **_summary(row),
        modules=[
            ModuleSummary(
                id=module["module_id"],
                title=module["title"],
                estimated_minutes=module["estimated_minutes"],
                status=str(module["status"]),
                order_index=module["order_index"],
            )
            for module in modules
        ],
        progress=progress,
    )
    return {"data": detail.model_dump(mode="json")}
