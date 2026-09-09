"""Intervention routes.

The queue and every mutation belong to a Teacher/Administrator. Recording,
updating and archiving are security-critical decisions about a learner, so they
also require a live session: a signed-out token should not be able to change
what happens to somebody's case.

Advisory text is not accepted from a request. It is written by the AI routes,
and nothing about a case's severity, status or lifecycle depends on it.
"""

from __future__ import annotations

import json
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Query, Response

from app.dependencies import ActorDb, SensitiveActor, TeacherAdmin
from middleware.errors import ApiError
from middleware.request_context import current_request_id
from modules.interventions import repository
from modules.interventions.schemas import (
    CaseStatus,
    InterventionDetail,
    InterventionSummary,
    RecordInterventionRequest,
    Severity,
    UpdateInterventionRequest,
)

router = APIRouter(tags=["interventions"])

MAX_PAGE_SIZE = 100
DEFAULT_PAGE_SIZE = 20


def _json_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, str):
        loaded = json.loads(value)
        return list(loaded) if isinstance(loaded, list) else []
    return list(value)


def _number(value: Any) -> float | None:
    return None if value is None else float(value)


def _summary_fields(row: Any) -> dict[str, Any]:
    return {
        "id": row["intervention_id"],
        "student": {
            "id": str(row["student_id"]),
            "learner_id": row["learner_id"],
            "full_name": row["full_name"],
            "section_id": str(row["section_id"]) if row["section_id"] else None,
            "section_name": row["section_name"],
        },
        "competency": {
            "id": str(row["competency_id"]),
            "code": row["competency_code"],
            "name": row["competency_name"],
        },
        "severity": str(row["severity"]),
        "status": str(row["status"]),
        "intervention_type": str(row["intervention_type"]),
        "recorded_by": row["recorded_by"],
        "recorded_at": row["recorded_at"],
        "created_at": row["created_at"],
        "resolved_at": row["resolved_at"],
    }


def _detail(row: Any) -> InterventionDetail:
    return InterventionDetail(
        **_summary_fields(row),
        evidence={
            "diagnostic_score": _number(row["diagnostic_score"]),
            "current_score": _number(row["current_score"]),
            "attempt_count": row["attempt_count"] or 0,
            "unsuccessful_attempts": row["unsuccessful_attempts"] or 0,
        },
        incorrect_patterns=_json_list(row["incorrect_patterns"]),
        modules_attempted=_json_list(row["modules_attempted"]),
        educator_notes=row["educator_notes"],
        reopen_reason=row["reopen_reason"],
        ai_insight=row["ai_insight"],
        ai_recommendation=row["ai_recommendation"],
        ai_provider=row["ai_provider"],
        ai_model=row["ai_model"],
        ai_confidence_score=_number(row["ai_confidence_score"]),
    )


@router.get("/interventions")
async def list_interventions(
    _actor: TeacherAdmin,
    connection: ActorDb,
    student_id: Annotated[UUID | None, Query()] = None,
    grade_id: Annotated[UUID | None, Query()] = None,
    section_id: Annotated[UUID | None, Query()] = None,
    competency_id: Annotated[UUID | None, Query()] = None,
    severity: Annotated[Severity | None, Query()] = None,
    status: Annotated[CaseStatus | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = DEFAULT_PAGE_SIZE,
) -> dict[str, Any]:
    """The intervention queue, with the documented filters."""
    offset = (page - 1) * page_size
    filters = {
        "student_id": student_id,
        "grade_id": grade_id,
        "section_id": section_id,
        "competency_id": competency_id,
        "severity": severity.value if severity else None,
        "status": status.value if status else None,
    }
    rows = await repository.queue(connection, limit=page_size, offset=offset, **filters)
    total = await repository.queue_total(connection, **filters)

    return {
        "data": [
            InterventionSummary(**_summary_fields(row)).model_dump(mode="json") for row in rows
        ],
        "meta": {
            "page": page,
            "page_size": page_size,
            "total_items": total,
            "total_pages": (total + page_size - 1) // page_size if page_size else 0,
        },
    }


@router.get("/interventions/{intervention_id}")
async def read_intervention(
    _actor: TeacherAdmin, connection: ActorDb, intervention_id: UUID
) -> dict[str, Any]:
    """One case, with the deterministic evidence behind it."""
    row = await repository.intervention(connection, intervention_id)
    if row is None:
        raise ApiError(404, "No intervention was found")
    return {"data": _detail(row).model_dump(mode="json")}


@router.post("/interventions", status_code=201)
async def record_intervention(
    _actor: TeacherAdmin,
    _session: SensitiveActor,
    connection: ActorDb,
    body: RecordInterventionRequest,
) -> dict[str, Any]:
    """Record a case, or the first action on one the system opened automatically."""
    row = await repository.record(
        connection,
        student_id=body.student_id,
        competency_id=body.competency_id,
        severity=body.severity.value,
        intervention_type=body.intervention_type.value,
        educator_notes=body.educator_notes,
        request_id=current_request_id(),
    )
    if row is None:
        raise ApiError(404, "No learner or competency was found")

    return {
        "data": {
            "id": str(row["intervention_id"]),
            "status": str(row["status"]),
            "recorded_at": row["recorded_at"].isoformat() if row["recorded_at"] else None,
            "recorded_by": row["recorded_by"],
        }
    }


@router.patch("/interventions/{intervention_id}")
async def update_intervention(
    _actor: TeacherAdmin,
    _session: SensitiveActor,
    connection: ActorDb,
    intervention_id: UUID,
    body: UpdateInterventionRequest,
) -> dict[str, Any]:
    """Update severity, type, notes or lifecycle status.

    The transitions are enforced in the database, so an impossible move is
    refused there rather than accepted here and written anyway.
    """
    row = await repository.update(
        connection,
        intervention_id=intervention_id,
        severity=body.severity.value if body.severity else None,
        intervention_type=(
            body.intervention_type.value if body.intervention_type else None
        ),
        educator_notes=body.educator_notes,
        status=body.status.value if body.status else None,
        reopen_reason=body.reopen_reason,
        request_id=current_request_id(),
    )
    if row is None:
        raise ApiError(404, "No intervention was found")
    return {"data": _detail(row).model_dump(mode="json")}


@router.delete("/interventions/{intervention_id}", status_code=204)
async def archive_intervention(
    _actor: TeacherAdmin,
    _session: SensitiveActor,
    connection: ActorDb,
    intervention_id: UUID,
) -> Response:
    """Archive an incorrect or duplicate case. Cases are never deleted."""
    archived = await repository.archive(
        connection, intervention_id=intervention_id, request_id=current_request_id()
    )
    if not archived:
        raise ApiError(404, "No open intervention was found")
    return Response(status_code=204)
