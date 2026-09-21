"""Intervention routes.

The queue and every mutation belong to a Teacher/Administrator. Recording,
updating and archiving are security-critical decisions about a learner, so they
also require a live session: a signed-out token should not be able to change
what happens to somebody's case.

The model identifier is deployment configuration. It is stored on the case as
provenance, because the data model asks for it, and it is deliberately absent
from every response: a browser has no use for it, and `.env` values are not
printed anywhere.

Advisory text is never accepted from a request. A teacher may ask for a
suggestion, and the evidence that leaves the building is assembled here from
the case's own deterministic record; the answer is written to the case's
advisory columns without ever passing through a browser. Storing a suggestion
changes nothing about severity, status, type or the educator's own notes, so a
case reads the same with Groq switched off as with it switched on.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Query, Request, Response

from app.dependencies import ActorDb, SensitiveActor, TeacherAdmin
from middleware.errors import ApiError
from middleware.request_context import current_request_id
from modules.ai.schemas import MAX_ATTEMPTS, MAX_TEXT, TeacherInsightRequest
from modules.ai.service import UNAVAILABLE, UNAVAILABLE_MESSAGE, request_advice
from modules.ai.support_plan import INSTRUCTIONS, MAX_TOKENS, parse_support_plan
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

#: Matching `interventions_ai_insight_length` in the schema. The plan's own
#: fields are bounded far below this; the cap stays as the last guard on the
#: column, so a constraint violation is never how a teacher finds out.
MAX_ADVICE_LENGTH = 4000


def _json_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, str):
        loaded = json.loads(value)
        return list(loaded) if isinstance(loaded, list) else []
    return list(value)


def _json_object(value: Any) -> dict[str, Any] | None:
    """A jsonb column as a dictionary, or nothing at all."""
    if value is None:
        return None
    if isinstance(value, str):
        try:
            loaded = json.loads(value)
        except ValueError:
            return None
        return loaded if isinstance(loaded, dict) else None
    return dict(value) if isinstance(value, dict) else None


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
        "evidence": {
            "diagnostic_score": _number(row["diagnostic_score"]),
            "current_score": _number(row["current_score"]),
            "attempt_count": row["attempt_count"] or 0,
            "unsuccessful_attempts": row["unsuccessful_attempts"] or 0,
        },
        "recorded_by": row["recorded_by"],
        "recorded_at": row["recorded_at"],
        "created_at": row["created_at"],
        "resolved_at": row["resolved_at"],
        "educator_notes": row["educator_notes"],
        "reopen_reason": row["reopen_reason"],
    }


def _detail(row: Any) -> InterventionDetail:
    return InterventionDetail(
        **_summary_fields(row),
        incorrect_patterns=_json_list(row["incorrect_patterns"]),
        modules_attempted=_json_list(row["modules_attempted"]),
        ai_insight=row["ai_insight"],
        ai_recommendation=row["ai_recommendation"],
        ai_provider=row["ai_provider"],
        ai_confidence_score=_number(row["ai_confidence_score"]),
        ai_plan=_json_object(row["ai_plan"]),
    )


def _exclusive_end(value: datetime | None) -> datetime | None:
    """The upper bound the queue SQL expects, which is exclusive.

    The date picker sends `YYYY-MM-DD`, which parses to midnight. Advancing a
    midnight bound by one day keeps every case opened on the selected date; a
    caller that supplies a time of day keeps the instant it asked for.
    """
    if value is None:
        return None
    if (value.hour, value.minute, value.second, value.microsecond) == (0, 0, 0, 0):
        return value + timedelta(days=1)
    return value


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
    date_from: Annotated[datetime | None, Query()] = None,
    date_to: Annotated[datetime | None, Query()] = None,
    min_attempts: Annotated[int | None, Query(ge=0)] = None,
    min_score_drop: Annotated[int | None, Query(ge=0)] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = DEFAULT_PAGE_SIZE,
) -> dict[str, Any]:
    """The intervention queue, with the documented filters.

    The advanced filters stay deterministic: a date range on when the case was
    opened, an attempt-count floor, and a minimum diagnostic-to-current score
    drop. None of these are computed by AI.
    """
    offset = (page - 1) * page_size
    filters = {
        "student_id": student_id,
        "grade_id": grade_id,
        "section_id": section_id,
        "competency_id": competency_id,
        "severity": severity.value if severity else None,
        "status": status.value if status else None,
        "date_from": date_from,
        "date_to": _exclusive_end(date_to),
        "min_attempts": min_attempts,
        "min_score_drop": min_score_drop,
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


def _clamp_score(value: Any) -> float | None:
    """A stored percentage as the advisory contract will accept it.

    The AI request models bound scores to 0-100. A stored value outside that
    range is a data problem, not a reason to refuse a teacher their suggestion,
    so it is dropped from the evidence rather than raised as a validation
    error against a request the teacher never wrote.
    """
    number = _number(value)
    if number is None or not 0 <= number <= 100:
        return None
    return number


def _display_context(row: Any) -> str:
    """The case, in one sentence, with nobody's name in it.

    Everything here is deterministic and already on the case: the competency
    code, the two scores and the attempt counts. The learner is referred to as
    "the learner", because who they are is not what the question is about and
    the adapter's redaction should not be the only thing standing between a
    child's name and a third-party API.
    """
    parts = [f"Competency {row['competency_code'] or 'unknown'}."]

    diagnostic = _clamp_score(row["diagnostic_score"])
    current = _clamp_score(row["current_score"])
    if diagnostic is not None:
        parts.append(f"The learner scored {diagnostic:g}% at diagnostic.")
    if current is not None:
        parts.append(f"They are now at {current:g}%.")

    attempts = row["attempt_count"] or 0
    unsuccessful = row["unsuccessful_attempts"] or 0
    parts.append(
        f"{attempts} scored attempt(s), {unsuccessful} of them unsuccessful."
    )
    parts.append(f"A teacher has opened a {row['severity']} priority case.")

    return " ".join(parts)[:MAX_TEXT]


@router.post("/interventions/{intervention_id}/ai-suggestion")
async def suggest_for_intervention(
    actor: TeacherAdmin,
    _session: SensitiveActor,
    connection: ActorDb,
    request: Request,
    intervention_id: UUID,
) -> dict[str, Any]:
    """Ask Groq for a support plan on one case, and keep what it said.

    The teacher asks for this; nothing generates a suggestion on its own. The
    evidence sent is assembled here from the case's own deterministic record,
    so a browser cannot widen what leaves the building, and the answer is
    written straight to the case's advisory columns without passing through a
    client.

    What comes back is a plan, not an essay: one learning gap, at most three
    strategies, one scaffold and one next check, each bounded. That shape is
    asked for in the prompt and then enforced here, because a prompt is a
    request rather than a guarantee — a reply that ignores it is trimmed into
    the same shape or, failing that, read as a single sentence.

    Storing is not applying. Severity, status, type and the educator's notes are
    untouched, and the teacher still has to decide what — if anything — to
    record. When Groq is disabled, unreachable, slow or incoherent, this route
    answers 503 and the case is exactly as it was.
    """
    row = await repository.intervention(connection, intervention_id)
    if row is None:
        raise ApiError(404, "No intervention was found")

    evidence = TeacherInsightRequest(
        competency_id=row["competency_id"],
        diagnostic_score=_clamp_score(row["diagnostic_score"]),
        current_score=_clamp_score(row["current_score"]),
        attempt_count=row["attempt_count"] or 0,
        unsuccessful_attempts=row["unsuccessful_attempts"] or 0,
        incorrect_patterns=_json_list(row["incorrect_patterns"])[:MAX_ATTEMPTS],
        completed_modules=_json_list(row["modules_attempted"])[:MAX_ATTEMPTS],
        display_context=_display_context(row),
    )

    # One question, not two. The pair this replaces produced a teaching note
    # and a remediation idea that said the same thing twice, at twice the
    # length, and a teacher had to read both to find out.
    answer = await request_advice(
        request,
        purpose="intervention support plan",
        model=evidence,
        actor=actor,
        instructions=INSTRUCTIONS,
        max_tokens=MAX_TOKENS,
    )

    plan = parse_support_plan(answer.text)
    if plan is None:
        raise ApiError(503, UNAVAILABLE_MESSAGE, code=UNAVAILABLE)

    updated = await repository.attach_advice(
        connection,
        intervention_id=intervention_id,
        # The gap sentence doubles as the plain-text summary, so an export or a
        # printed report has something true to show without knowing the plan.
        insight=plan.gap[:MAX_ADVICE_LENGTH],
        recommendation=None,
        provider=answer.provider,
        model=answer.model,
        confidence=answer.confidence,
        plan=plan.model_dump(mode="json"),
        request_id=current_request_id(),
    )
    if updated is None:
        raise ApiError(404, "No intervention was found")
    return {"data": _detail(updated).model_dump(mode="json")}


@router.delete("/interventions/{intervention_id}/ai-suggestion")
async def dismiss_intervention_suggestion(
    _actor: TeacherAdmin,
    _session: SensitiveActor,
    connection: ActorDb,
    intervention_id: UUID,
) -> dict[str, Any]:
    """Take a suggestion off a case, leaving every other field alone.

    A teacher who read the advice and decided against it should be able to say
    so, and have the case stop showing it. The dismissal is audited, so the
    decision is part of the record rather than a silent deletion.
    """
    updated = await repository.clear_advice(
        connection, intervention_id=intervention_id, request_id=current_request_id()
    )
    if updated is None:
        raise ApiError(404, "No intervention was found")
    return {"data": _detail(updated).model_dump(mode="json")}


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
