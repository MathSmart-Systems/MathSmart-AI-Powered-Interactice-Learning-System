"""Teacher/Administrator dashboard, analytics and export routes.

Every read runs through a `security_invoker` reporting view, so the same
statement is correct for whoever runs it. Two rules are applied on top, and
neither is cosmetic: an average over a cohort small enough to identify one
learner is withheld, and every cell of the CSV export is neutralised so a
spreadsheet cannot execute it.

The export is a sensitive operation. It needs a live session, and it writes an
audit row naming what was exported — never the rows themselves.
"""

from __future__ import annotations

import json
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Query, Response

from app.dependencies import ActorDb, SensitiveActor, TeacherAdmin
from middleware.request_context import current_request_id
from modules.teacher_admin import reporting_repository as repository
from modules.teacher_admin import service

router = APIRouter(tags=["teacher-admin"])

MAX_PAGE_SIZE = 200
DEFAULT_PAGE_SIZE = 50
EXPORT_LIMIT = 5000

EXPORT_HEADER = [
    "learner_id",
    "section",
    "full_name",
    "diagnostic_status",
    "diagnostic_average",
    "current_average",
    "competencies_mastered",
    "modules_completed",
    "monitoring_status",
    "open_interventions",
]


def _number(value: Any) -> float | None:
    return None if value is None else float(value)


def _learner(row: Any) -> dict[str, Any]:
    return {
        "student_id": str(row["student_id"]),
        "learner_id": row["learner_id"],
        "full_name": row["full_name"],
        "grade_id": str(row["grade_id"]) if row["grade_id"] else None,
        "section_id": str(row["section_id"]) if row["section_id"] else None,
        "section_name": row["section_name"],
        "diagnostic_status": (
            str(row["diagnostic_status"]) if row["diagnostic_status"] else None
        ),
        "diagnostic_score": _number(row["diagnostic_average"]),
        "overall_mastery": _number(row["current_average"]),
        "competencies_mastered": row["competencies_mastered"] or 0,
        "modules_completed_count": row["modules_completed"] or 0,
        "monitoring_status": (
            str(row["monitoring_status"]) if row["monitoring_status"] else None
        ),
        "active_intervention_count": row["open_intervention_count"] or 0,
    }


def _competency(row: Any) -> dict[str, Any]:
    """A competency rollup, with the average withheld for a small cohort."""
    hidden = service.suppressed(row["learners_tracked"])
    return {
        "competency_id": str(row["competency_id"]),
        "code": row["code"],
        "name": row["name"],
        "domain": row["domain"],
        "status": str(row["status"]),
        "learners_tracked": row["learners_tracked"] or 0,
        "mastered_count": row["mastered_count"] or 0,
        "developing_count": row["developing_count"] or 0,
        "needs_improvement_count": row["needs_improvement_count"] or 0,
        "average_current_score": (
            None if hidden else _number(row["average_current_score"])
        ),
        "average_diagnostic_score": (
            None if hidden else _number(row["average_diagnostic_score"])
        ),
        "growth": (
            None
            if hidden
            else service.growth(
                row["average_current_score"], row["average_diagnostic_score"]
            )
        ),
        "suppressed": hidden,
    }


@router.get("/teacher-admin/dashboard")
async def read_dashboard(
    _actor: TeacherAdmin,
    connection: ActorDb,
    grade_id: Annotated[UUID | None, Query()] = None,
    section_id: Annotated[UUID | None, Query()] = None,
) -> dict[str, Any]:
    """Cohort totals, the competency overview, and the learners who need support."""
    totals = await repository.dashboard(
        connection, grade_id=grade_id, section_id=section_id
    )
    competency_rows = await repository.competencies(
        connection, grade_id=grade_id, section_id=section_id
    )
    priority = await repository.learners(
        connection,
        grade_id=grade_id,
        section_id=section_id,
        at_risk_only=True,
        limit=DEFAULT_PAGE_SIZE,
        offset=0,
    )

    return {
        "data": {
            "totals": {
                "learner_count": totals["learner_count"] or 0,
                "active_count": totals["active_count"] or 0,
                "needs_support_count": totals["needs_support_count"] or 0,
                "improving_count": totals["improving_count"] or 0,
                "mastered_count": totals["mastered_count"] or 0,
                "average_mastery": _number(totals["average_mastery"]),
                "open_intervention_count": totals["open_intervention_count"] or 0,
                "published_competency_count": totals["published_competency_count"] or 0,
                "scored_attempt_count": totals["scored_attempt_count"] or 0,
                "completed_module_count": totals["completed_module_count"] or 0,
            },
            "competencies": [_competency(row) for row in competency_rows],
            "priority_learners": [_learner(row) for row in priority],
        }
    }


@router.get("/teacher-admin/classes")
async def list_classes(
    _actor: TeacherAdmin,
    connection: ActorDb,
    grade_id: Annotated[UUID | None, Query()] = None,
) -> dict[str, Any]:
    """The permitted sections, with their adviser and cohort shape."""
    rows = await repository.sections(connection, grade_id=grade_id)
    return {
        "data": [
            {
                "id": str(row["section_id"]),
                "grade_id": str(row["grade_id"]) if row["grade_id"] else None,
                "name": row["section_name"],
                "is_active": bool(row["is_active"]),
                "adviser": {
                    "id": str(row["adviser_id"]) if row["adviser_id"] else None,
                    "full_name": row["adviser_name"],
                },
                "learner_count": row["learner_count"] or 0,
                "needs_intervention_count": row["needs_intervention_count"] or 0,
                "improving_count": row["improving_count"] or 0,
                "mastered_count": row["mastered_count"] or 0,
                "average_current_score": _number(row["average_current_score"]),
            }
            for row in rows
        ]
    }


@router.get("/teacher-admin/classes/{section_id}/students")
async def list_class_students(
    _actor: TeacherAdmin,
    connection: ActorDb,
    section_id: UUID,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = DEFAULT_PAGE_SIZE,
) -> dict[str, Any]:
    """The roster for one section."""
    offset = (page - 1) * page_size
    rows = await repository.learners(
        connection,
        grade_id=None,
        section_id=section_id,
        at_risk_only=False,
        limit=page_size,
        offset=offset,
    )
    return {
        "data": [_learner(row) for row in rows],
        "meta": {"page": page, "page_size": page_size},
    }


@router.get("/teacher-admin/classes/{section_id}/heatmap")
async def read_class_heatmap(
    _actor: TeacherAdmin, connection: ActorDb, section_id: UUID
) -> dict[str, Any]:
    """Learners by competency, with a band beside every score.

    The band is not decoration: a score communicated only by colour is
    unreadable to part of the audience, so the text always accompanies it.
    """
    rows = await repository.heatmap(connection, section_id)

    learners: dict[str, dict[str, Any]] = {}
    competencies: dict[str, str] = {}
    for row in rows:
        competencies[str(row["competency_id"])] = row["competency_code"]
        learner = learners.setdefault(
            str(row["student_id"]),
            {
                "student_id": str(row["student_id"]),
                "learner_id": row["learner_id"],
                "full_name": row["full_name"],
                "cells": [],
            },
        )
        learner["cells"].append(
            {
                "competency_id": str(row["competency_id"]),
                "competency_code": row["competency_code"],
                "score": _number(row["current_score"]),
                "mastery_band": (
                    str(row["mastery_band"]) if row["mastery_band"] else None
                ),
            }
        )

    return {
        "data": {
            "competencies": [
                {"id": key, "code": code} for key, code in competencies.items()
            ],
            "rows": list(learners.values()),
        }
    }


@router.get("/teacher-admin/students/at-risk")
async def list_at_risk(
    _actor: TeacherAdmin,
    connection: ActorDb,
    grade_id: Annotated[UUID | None, Query()] = None,
    section_id: Annotated[UUID | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = DEFAULT_PAGE_SIZE,
) -> dict[str, Any]:
    """Learners who meet the deterministic needs-support rule."""
    offset = (page - 1) * page_size
    rows = await repository.learners(
        connection,
        grade_id=grade_id,
        section_id=section_id,
        at_risk_only=True,
        limit=page_size,
        offset=offset,
    )
    return {
        "data": [_learner(row) for row in rows],
        "meta": {"page": page, "page_size": page_size},
    }


@router.get("/teacher-admin/analytics")
async def read_analytics(
    _actor: TeacherAdmin,
    connection: ActorDb,
    grade_id: Annotated[UUID | None, Query()] = None,
    section_id: Annotated[UUID | None, Query()] = None,
) -> dict[str, Any]:
    """Cohort mastery, growth, and per-competency performance."""
    totals = await repository.dashboard(
        connection, grade_id=grade_id, section_id=section_id
    )
    competency_rows = await repository.competencies(
        connection, grade_id=grade_id, section_id=section_id
    )
    section_rows = await repository.sections(connection, grade_id=grade_id)

    return {
        "data": {
            "cohort": {
                "learner_count": totals["learner_count"] or 0,
                "average_mastery": _number(totals["average_mastery"]),
                "open_intervention_count": totals["open_intervention_count"] or 0,
            },
            "competencies": [_competency(row) for row in competency_rows],
            "sections": [
                {
                    "id": str(row["section_id"]),
                    "name": row["section_name"],
                    "learner_count": row["learner_count"] or 0,
                    "average_current_score": _number(row["average_current_score"]),
                }
                for row in section_rows
                if section_id is None or str(row["section_id"]) == str(section_id)
            ],
        }
    }


@router.get("/teacher-admin/reports/progress.csv")
async def export_progress_csv(
    _actor: TeacherAdmin,
    _session: SensitiveActor,
    connection: ActorDb,
    grade_id: Annotated[UUID | None, Query()] = None,
    section_id: Annotated[UUID | None, Query()] = None,
) -> Response:
    """Export the selected cohort summary.

    Least data: identity is the learner id and name the school already uses,
    with no email address and no account identifier. Every cell is neutralised,
    the filename is timestamped, and the export is audited.
    """
    rows = await repository.learners(
        connection,
        grade_id=grade_id,
        section_id=section_id,
        at_risk_only=False,
        limit=EXPORT_LIMIT,
        offset=0,
    )

    body = service.to_csv(
        EXPORT_HEADER,
        (
            [
                row["learner_id"],
                row["section_name"],
                row["full_name"],
                row["diagnostic_status"],
                row["diagnostic_average"],
                row["current_average"],
                row["competencies_mastered"],
                row["modules_completed"],
                row["monitoring_status"],
                row["open_intervention_count"],
            ]
            for row in rows
        ),
    )

    # The audit row names the shape of the export, never its contents.
    await repository.record_audit_event(
        connection,
        action="report.exported",
        target_type="progress_report",
        target_id=section_id,
        request_id=current_request_id(),
        details=json.dumps(
            {
                "grade_id": str(grade_id) if grade_id else None,
                "section_id": str(section_id) if section_id else None,
                "row_count": len(rows),
            }
        ),
    )

    filename = service.export_filename()
    return Response(
        content=body,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
