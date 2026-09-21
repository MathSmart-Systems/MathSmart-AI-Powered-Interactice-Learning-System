"""Assessment routes.

Reading is ordinary. Sitting, answering and submitting are learner actions that
run through database functions, because the tables involved are SELECT-only for
the caller and grading has to read a column the caller cannot. Authorising a
reassessment is an educator decision, so it additionally requires a live
session: it changes what a learner is allowed to do, and a signed-out token
should not be able to do that.
"""

from __future__ import annotations

import json
from typing import Annotated, Any
from uuid import UUID

import asyncpg
from fastapi import APIRouter, Query, Response

from app.dependencies import ActorDb, CurrentActor, SensitiveActor, TeacherAdmin
from middleware.auth import MathSmartRole
from middleware.errors import ApiError
from middleware.request_context import current_request_id
from modules.assessments import repository
from modules.assessments.schemas import (
    AssessmentSummary,
    AssessmentType,
    AttemptDelivery,
    AttemptReport,
    AttemptSummary,
    AuthoriseReassessmentRequest,
    CompetencyResult,
    DeliveredQuestion,
    DiagnosticStatus,
    PathItem,
    ReassessmentAuthorization,
    ReviewedQuestion,
    SaveAnswersRequest,
)
from modules.competencies.schemas import PublicationStatus

router = APIRouter(tags=["assessments"])

MAX_PAGE_SIZE = 100
DEFAULT_PAGE_SIZE = 20


def _json_value(value: Any) -> Any:
    """jsonb arrives as text from asyncpg and as a value from a fake."""
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return value
    return value


def _only_a_learner(actor: Any) -> None:
    if actor.role is not MathSmartRole.STUDENT:
        raise ApiError(403, "This action belongs to a learner")


def _summary(row: Any) -> dict[str, Any]:
    return AssessmentSummary(
        id=row["assessment_id"],
        grade_id=row["grade_id"],
        title=row["title"],
        type=str(row["assessment_type"]),
        status=str(row["status"]),
        duration_minutes=row["duration_minutes"],
        description=row["description"],
        total_questions=row["total_questions"] or 0,
        attempt_count=row["attempt_count"] or 0,
        latest_attempt_id=row["latest_attempt_id"],
        latest_status=str(row["latest_status"]) if row["latest_status"] else None,
        is_ready=bool(row["is_ready"]),
        availability=str(row["availability"]) if row.get("availability") else None,
    ).model_dump(mode="json")


def _question(row: Any) -> DeliveredQuestion:
    return DeliveredQuestion(
        id=row["question_id"],
        competency_id=row["competency_id"],
        competency_name=row["competency_name"],
        text=row["prompt"],
        type=str(row["question_type"]),
        choices=_json_value(row["choices"]) or [],
        difficulty=str(row["difficulty"]),
        visual_aid_description=row["visual_aid_description"],
    )


def _path_item(row: Any) -> PathItem:
    return PathItem(
        id=row["path_item_id"],
        priority=row["priority"],
        reason=row["reason"],
        status=str(row["status"]),
        competency={
            "id": str(row["competency_id"]),
            "code": row["competency_code"],
            "name": row["competency_name"],
        },
        module={
            "id": str(row["module_id"]),
            "title": row["module_title"],
            "estimated_minutes": row["estimated_minutes"],
        },
    )


def _next_action(path: list[PathItem]) -> dict[str, str]:
    """Deterministic, and the same rule every time: work first, dashboard otherwise."""
    if path:
        return {"type": "learning_path", "label": "Start Your Learning Path"}
    return {"type": "dashboard", "label": "Return to Dashboard"}


async def _visible_assessment(actor: Any, connection: Any, assessment_id: UUID) -> Any:
    """The assessment as this caller is allowed to see it, or a refusal.

    Typing an identifier into the address bar is not authorization. The
    catalogue restricts a learner to their own year group, and a paper they
    could never be shown has to answer the same way whether it is missing or
    merely somebody else's — otherwise the difference between the two replies
    is itself a way to enumerate the assessment table.
    """
    row = await repository.assessment(
        connection, user_id=actor.user_id, assessment_id=assessment_id
    )
    if row is None:
        raise ApiError(404, "No assessment was found")

    if actor.role is MathSmartRole.STUDENT:
        grade_id = await repository.learner_grade_id(connection, user_id=actor.user_id)
        if grade_id is None or row["grade_id"] != grade_id:
            raise ApiError(404, "No assessment was found")

    return row


@router.get("/assessments")
async def list_assessments(
    actor: CurrentActor,
    connection: ActorDb,
    type: Annotated[AssessmentType | None, Query()] = None,
    grade_id: Annotated[UUID | None, Query()] = None,
    status: Annotated[PublicationStatus | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = DEFAULT_PAGE_SIZE,
) -> dict[str, Any]:
    """The assessment catalogue, with the caller's own attempt summary."""
    offset = (page - 1) * page_size
    filters = {
        "assessment_type": type.value if type else None,
        "grade_id": grade_id,
        "status": status.value if status else None,
    }
    rows = await repository.listing(
        connection, user_id=actor.user_id, limit=page_size, offset=offset, **filters
    )
    total = await repository.listing_total(connection, user_id=actor.user_id, **filters)

    return {
        "data": [_summary(row) for row in rows],
        "meta": {
            "page": page,
            "page_size": page_size,
            "total_items": total,
            "total_pages": (total + page_size - 1) // page_size if page_size else 0,
        },
    }


@router.get("/assessments/{assessment_id}")
async def read_assessment(
    actor: CurrentActor, connection: ActorDb, assessment_id: UUID
) -> dict[str, Any]:
    """One assessment. Never its questions, and never an answer key."""
    row = await _visible_assessment(actor, connection, assessment_id)
    return {"data": _summary(row)}


@router.post("/assessments/{assessment_id}/attempts", status_code=201)
async def start_attempt(
    actor: CurrentActor, connection: ActorDb, assessment_id: UUID, response: Response
) -> dict[str, Any]:
    """Start an attempt, or resume the one already open.

    201 for a new attempt and 200 for a resumed one, as the route contract
    documents. A refresh is not an error and must not create a second attempt.
    """
    _only_a_learner(actor)
    await _visible_assessment(actor, connection, assessment_id)

    already_open = await repository.open_attempt_id(
        connection, assessment_id=assessment_id, user_id=actor.user_id
    )
    try:
        attempt_row = await repository.start_attempt(connection, assessment_id)
    except asyncpg.InsufficientPrivilegeError as exc:
        # A learner asking for a second sitting of an assessment they have
        # already finished. app.start_assessment_attempt refuses that without an
        # educator's authorization, and the refusal is an ordinary answer to an
        # ordinary request, not a fault: it must not reach the caller as a 500.
        raise ApiError(
            403,
            "Sitting this assessment again needs your teacher's authorisation",
            code="reassessment_not_authorized",
        ) from exc
    except asyncpg.NoDataFoundError as exc:
        # Not published, or its competency is not. Indistinguishable from
        # missing, from where the learner stands.
        raise ApiError(404, "No assessment was found") from exc
    except asyncpg.AssertError as exc:
        # The paper exists but cannot be delivered: no questions, some of them
        # unpublished, or an attempt opened before the question snapshot
        # existed. None of that is the learner's doing, and it used to reach
        # them as "the request could not be completed".
        raise ApiError(
            409,
            "This assessment is not ready yet. Ask your teacher to finish setting it up.",
            code="assessment_not_ready",
        ) from exc
    if attempt_row is None:
        raise ApiError(404, "No assessment was found")

    assessment_row = await repository.assessment(
        connection, user_id=actor.user_id, assessment_id=assessment_id
    )
    # The attempt's own frozen set, not the assessment's current membership.
    # The two diverge the moment a teacher archives or reorders a question, and
    # grading uses the frozen one — so delivering the current one showed a
    # learner something other than what they will be scored on.
    questions = await repository.delivered_questions(connection, attempt_row["attempt_id"])
    saved = await repository.saved_answers(connection, attempt_row["attempt_id"])

    response.status_code = 200 if already_open else 201
    delivery = AttemptDelivery(
        attempt_id=attempt_row["attempt_id"],
        assessment={
            "id": str(assessment_id),
            "title": assessment_row["title"] if assessment_row else None,
            "type": str(assessment_row["assessment_type"]) if assessment_row else None,
            "duration_minutes": assessment_row["duration_minutes"] if assessment_row else None,
            "total_questions": len(questions),
        },
        questions=[_question(row) for row in questions],
        saved_answers={
            str(row["question_id"]): _json_value(row["answer"]) for row in saved
        },
        started_at=attempt_row["started_at"],
    )
    return {"data": delivery.model_dump(mode="json")}


@router.get("/assessment-attempts/me")
async def list_own_attempts(
    actor: CurrentActor,
    connection: ActorDb,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = DEFAULT_PAGE_SIZE,
) -> dict[str, Any]:
    """The authenticated learner's own attempt history.

    This route is declared before ``/assessment-attempts/{attempt_id}`` so that
    FastAPI routes the literal segment ``"me"`` here rather than attempting to
    parse it as a UUID (which would return 422).

    Naming a learner is a Teacher/Administrator action; a learner always reads
    their own history through this route.
    """
    _only_a_learner(actor)

    student_id = await repository.own_student_id(connection, actor.user_id)
    if student_id is None:
        raise ApiError(403, "No learner profile was found for your account")

    student_id = UUID(str(student_id))
    offset = (page - 1) * page_size
    rows = await repository.attempt_history(
        connection, student_id=student_id, limit=page_size, offset=offset
    )
    total = await repository.attempt_history_total(connection, student_id=student_id)

    return {
        "data": [
            AttemptSummary(
                attempt_id=row["attempt_id"],
                assessment_id=row["assessment_id"],
                title=row["title"],
                type=str(row["assessment_type"]) if row["assessment_type"] else None,
                status=str(row["status"]),
                overall_score=row["overall_score"],
                started_at=row["started_at"],
                submitted_at=row["submitted_at"],
            ).model_dump(mode="json")
            for row in rows
        ],
        "meta": {
            "page": page,
            "page_size": page_size,
            "total_items": total,
            "total_pages": (total + page_size - 1) // page_size if page_size else 0,
        },
    }


@router.get("/diagnostic-status/me")
async def read_own_diagnostic_status(actor: CurrentActor, connection: ActorDb) -> dict[str, Any]:
    """Where the authenticated learner stands on the diagnostic.

    Naming a learner is a Teacher/Administrator action; a learner always reads
    their own status through this route. Returns ``reassessment_eligible: true``
    when a teacher has granted an unexpired, unconsumed authorization.
    """
    _only_a_learner(actor)

    student_id = await repository.own_student_id(connection, actor.user_id)
    if student_id is None:
        raise ApiError(403, "No learner profile was found for your account")

    student_id = UUID(str(student_id))
    row = await repository.diagnostic_status(connection, student_id)
    if row is None:
        raise ApiError(404, "No learner was found")

    authorised = row["authorization_id"] is not None
    status = DiagnosticStatus(
        status=str(row["diagnostic_status"]),
        latest_attempt_id=row["latest_attempt_id"],
        latest_score=row["latest_score"],
        reassessment_eligible=authorised,
        reassessment_reason=(
            "A Teacher/Administrator has authorised a reassessment." if authorised else None
        ),
    )
    return {"data": status.model_dump(mode="json")}


@router.patch("/assessment-attempts/{attempt_id}")
async def save_answers(
    actor: CurrentActor, connection: ActorDb, attempt_id: UUID, body: SaveAnswersRequest
) -> dict[str, Any]:
    """Autosave answers into the caller's own attempt while it is in progress."""
    _only_a_learner(actor)

    saved = await repository.save_answers(
        connection,
        attempt_id=attempt_id,
        answers=json.dumps(body.model_dump(mode="json")["answers"]),
    )
    return {"data": {"attempt_id": str(attempt_id), "saved": saved}}


def _extract_valid_payload(attempt_row: Any) -> dict[str, Any] | None:
    """Safely extract and validate result_payload if it contains valid competency results."""
    try:
        payload = attempt_row["result_payload"]
    except (KeyError, IndexError, TypeError):
        return None

    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except Exception:
            return None

    if (
        isinstance(payload, dict)
        and isinstance(payload.get("competency_results"), list)
        and len(payload["competency_results"]) > 0
    ):
        return payload
    return None


def _report_from_attempt(
    attempt_row: Any,
    results: list[Any],
    path_rows: list[Any],
    valid_payload: dict[str, Any] | None = None,
) -> AttemptReport:
    payload = valid_payload if valid_payload is not None else _extract_valid_payload(attempt_row)

    competency_results: list[CompetencyResult] = []
    path: list[PathItem] = []
    next_action: str | None = None

    if payload:
        try:
            competency_results = [
                CompetencyResult(
                    competency_id=r["competency_id"],
                    competency_name=r.get("competency_name"),
                    raw_score=r["raw_score"],
                    max_score=r["max_score"],
                    percentage=r["percentage"],
                    mastery_band=str(r["mastery_band"]),
                )
                for r in payload.get("competency_results", [])
            ]
            path = [
                PathItem(
                    id=p["id"],
                    priority=p["priority"],
                    reason=p.get("reason"),
                    status=str(p["status"]),
                    competency=p["competency"],
                    module=p["module"],
                )
                for p in payload.get("recommended_learning_path", [])
            ]
            next_action = payload.get("next_action") or _next_action(path)
        except (KeyError, TypeError, ValueError):
            competency_results = []
            path = []
            next_action = None

    if not competency_results:
        competency_results = [
            CompetencyResult(
                competency_id=row["competency_id"],
                competency_name=row["competency_name"],
                raw_score=row["raw_score"],
                max_score=row["max_score"],
                percentage=row["percentage"],
                mastery_band=str(row["mastery_band"]),
            )
            for row in results
        ]
        path = [_path_item(row) for row in path_rows]
        next_action = _next_action(path)

    return AttemptReport(
        attempt_id=attempt_row["attempt_id"],
        assessment_id=attempt_row["assessment_id"],
        status=str(attempt_row["status"]),
        overall_score=attempt_row["overall_score"],
        started_at=attempt_row["started_at"],
        submitted_at=attempt_row["submitted_at"],
        competency_results=competency_results,
        recommended_learning_path=path,
        next_action=next_action,
    )


@router.post("/assessment-attempts/{attempt_id}/submit")
async def submit_attempt(
    actor: CurrentActor,
    connection: ActorDb,
    attempt_id: UUID,
    body: SaveAnswersRequest,
) -> dict[str, Any]:
    """Finalise and grade an attempt.

    Everything in the response is the database's deterministic answer: the
    score, the bands, the path and the next action. Nothing here consults Groq.
    """
    _only_a_learner(actor)

    attempt_row = await repository.submit_attempt(
        connection,
        attempt_id=attempt_id,
        answers=json.dumps(body.model_dump(mode="json")["answers"]),
    )
    if attempt_row is None:
        raise ApiError(404, "No attempt of yours is in progress")

    valid_payload = _extract_valid_payload(attempt_row)
    if valid_payload is not None:
        results = []
        path_rows = []
    else:
        results = await repository.results_for(connection, attempt_id)
        path_rows = await repository.path_for(connection, attempt_row["student_id"])

    report = _report_from_attempt(attempt_row, results, path_rows, valid_payload=valid_payload)
    return {"data": report.model_dump(mode="json")}


@router.get("/assessment-attempts/{attempt_id}")
async def read_attempt(
    _actor: CurrentActor, connection: ActorDb, attempt_id: UUID
) -> dict[str, Any]:
    """Resumable state before submission, or the scored report after it.

    Whose attempt this may be is decided by the policies: a learner sees their
    own, a Teacher/Administrator sees the school's, and anyone else sees no row
    and is told it was not found.
    """
    attempt_row = await repository.attempt(connection, attempt_id)
    if attempt_row is None:
        raise ApiError(404, "No attempt was found")

    valid_payload = _extract_valid_payload(attempt_row)
    if valid_payload is not None:
        results = []
        path_rows = []
    else:
        results = await repository.results_for(connection, attempt_id)
        path_rows = (
            await repository.path_for(connection, attempt_row["student_id"])
            if attempt_row.get("student_id")
            else []
        )

    report = _report_from_attempt(attempt_row, results, path_rows, valid_payload=valid_payload)
    return {"data": report.model_dump(mode="json")}


@router.get("/assessment-attempts/{attempt_id}/review")
async def read_attempt_review(
    _actor: CurrentActor, connection: ActorDb, attempt_id: UUID
) -> dict[str, Any]:
    """Which questions were right, once the paper is closed.

    This exists because a score on its own teaches nothing. A learner who is
    told 6 out of 10 and shown no item has no way to know what to study, and
    the competency breakdown answers a different, coarser question.

    What it still does not carry is the correct answer. That column is not
    granted to this connection, so the report can say "this one was wrong" and
    cannot say "the answer was 72" — which is the line between reviewing a
    paper and handing over the key before a retake.

    Whose attempt this may be is decided by the policies, exactly as the
    attempt read-back above: a learner sees their own, a Teacher/Administrator
    sees the school's, and anyone else is told it was not found.
    """
    attempt_row = await repository.attempt(connection, attempt_id)
    if attempt_row is None:
        raise ApiError(404, "No attempt was found")

    rows = await repository.attempt_review(connection, attempt_id)
    items = [
        ReviewedQuestion(
            question_id=row["question_id"],
            position=row["position"],
            competency_id=row["competency_id"],
            competency_name=row["competency_name"],
            text=row["text"],
            question_type=row["question_type"],
            choices=_json_value(row["choices"]) or [],
            submitted_answer=_json_value(row["answer"]),
            is_correct=row["is_correct"],
        ).model_dump(mode="json")
        for row in rows
    ]

    return {
        "data": items,
        "meta": {
            "attempt_id": str(attempt_id),
            "status": str(attempt_row["status"]),
            "reviewable": bool(items),
        },
    }


@router.get("/students/{student_id}/assessment-attempts")
async def list_attempts_for_student(
    _actor: TeacherAdmin,
    connection: ActorDb,
    student_id: UUID,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = DEFAULT_PAGE_SIZE,
) -> dict[str, Any]:
    """A named learner's attempt history.

    A learner reads their own through the attempt routes; naming a learner is a
    Teacher/Administrator's action.
    """
    offset = (page - 1) * page_size
    rows = await repository.attempt_history(
        connection, student_id=student_id, limit=page_size, offset=offset
    )
    total = await repository.attempt_history_total(connection, student_id=student_id)

    return {
        "data": [
            AttemptSummary(
                attempt_id=row["attempt_id"],
                assessment_id=row["assessment_id"],
                title=row["title"],
                type=str(row["assessment_type"]) if row["assessment_type"] else None,
                status=str(row["status"]),
                overall_score=row["overall_score"],
                started_at=row["started_at"],
                submitted_at=row["submitted_at"],
            ).model_dump(mode="json")
            for row in rows
        ],
        "meta": {
            "page": page,
            "page_size": page_size,
            "total_items": total,
            "total_pages": (total + page_size - 1) // page_size if page_size else 0,
        },
    }


@router.get("/students/{student_id}/diagnostic-status")
async def read_diagnostic_status(
    _actor: TeacherAdmin, connection: ActorDb, student_id: UUID
) -> dict[str, Any]:
    """Where a named learner stands on the diagnostic."""
    row = await repository.diagnostic_status(connection, student_id)
    if row is None:
        raise ApiError(404, "No learner was found")

    authorised = row["authorization_id"] is not None
    status = DiagnosticStatus(
        status=str(row["diagnostic_status"]),
        latest_attempt_id=row["latest_attempt_id"],
        latest_score=row["latest_score"],
        reassessment_eligible=authorised,
        reassessment_reason=(
            "A Teacher/Administrator has authorised a reassessment." if authorised else None
        ),
    )
    return {"data": status.model_dump(mode="json")}


@router.post("/students/{student_id}/reassessment-authorizations", status_code=201)
async def authorise_reassessment(
    _actor: TeacherAdmin,
    _session: SensitiveActor,
    connection: ActorDb,
    student_id: UUID,
    body: AuthoriseReassessmentRequest,
) -> dict[str, Any]:
    """Authorise a learner to sit an assessment again, with the reason why.

    A security-critical educator decision: it needs a Teacher/Administrator, a
    live session, and it is audited inside the same database transaction that
    records it.
    """
    row = await repository.authorise_reassessment(
        connection,
        student_id=student_id,
        assessment_id=body.assessment_id,
        reason=body.reason,
        expires_at=body.expires_at,
        request_id=current_request_id(),
    )
    if row is None:
        raise ApiError(404, "No learner or assessment was found")

    authorization = ReassessmentAuthorization(
        id=row["authorization_id"],
        student_id=row["student_id"],
        assessment_id=row["assessment_id"],
        reason=row["reason"],
        granted_at=row["granted_at"],
        expires_at=row["expires_at"],
    )
    return {"data": authorization.model_dump(mode="json")}
