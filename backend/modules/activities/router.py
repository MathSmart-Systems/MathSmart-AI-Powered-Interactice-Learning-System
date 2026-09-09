"""Activity routes.

Everything a learner does here goes through a database function, for the same
two reasons throughout: the columns that decide correctness are ones the API
connection cannot read, and the learner's own records are SELECT-only for them.

`ai_feedback` and `ai_hint` are the only advisory fields in the module. They are
null unless Groq answered, and no score, band, pass decision or intervention
depends on them.
"""

from __future__ import annotations

import json
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Query, Response

from app.dependencies import ActorDb, CurrentActor, TeacherAdmin
from middleware.auth import MathSmartRole
from middleware.errors import ApiError
from modules.activities import repository
from modules.activities.schemas import (
    ActivityAttemptSummary,
    ActivityDetail,
    ActivityOutcome,
    ActivitySummary,
    AnswerCheck,
    AnswerCheckRequest,
    AttemptDelivery,
    DeliveredQuestion,
    Hint,
    HintRequest,
    SubmitActivityRequest,
)
from modules.competencies.schemas import PublicationStatus

router = APIRouter(tags=["activities"])

MAX_PAGE_SIZE = 100
DEFAULT_PAGE_SIZE = 20
MAX_SEARCH_LENGTH = 120


def _json_value(value: Any) -> Any:
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return value
    return value


def _only_a_learner(actor: Any) -> None:
    if actor.role is not MathSmartRole.STUDENT:
        raise ApiError(403, "This action belongs to a learner")


def _percentage(value: Any) -> float | None:
    return None if value is None else float(value)


def _summary(row: Any) -> dict[str, Any]:
    return ActivitySummary(
        id=row["activity_id"],
        module_id=row["module_id"],
        module_title=row["module_title"],
        competency_id=row["competency_id"],
        competency_name=row["competency_name"],
        title=row["title"],
        description=row["description"],
        estimated_minutes=row["estimated_minutes"],
        points=row["points"],
        mastery_threshold=row["mastery_threshold"],
        status=str(row["status"]),
        attempt_count=row["attempt_count"] or 0,
        best_score=_percentage(row["best_score"]),
        path_status=str(row["path_status"]) if row["path_status"] else None,
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


def _next_action(passed: bool) -> dict[str, str]:
    """Deterministic: keep going when it passed, practise again when it did not."""
    if passed:
        return {"type": "dashboard", "label": "Continue Learning"}
    return {"type": "retry", "label": "Try the Activity Again"}


@router.get("/activities")
async def list_activities(
    actor: CurrentActor,
    connection: ActorDb,
    module_id: Annotated[UUID | None, Query()] = None,
    competency_id: Annotated[UUID | None, Query()] = None,
    status: Annotated[PublicationStatus | None, Query()] = None,
    search: Annotated[str | None, Query(max_length=MAX_SEARCH_LENGTH)] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = DEFAULT_PAGE_SIZE,
) -> dict[str, Any]:
    """The activity catalogue, with the caller's own attempts and best score."""
    offset = (page - 1) * page_size
    filters = {
        "user_id": actor.user_id,
        "module_id": module_id,
        "competency_id": competency_id,
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


@router.get("/activities/{activity_id}")
async def read_activity(
    actor: CurrentActor, connection: ActorDb, activity_id: UUID
) -> dict[str, Any]:
    """One activity and its ordered questions, without answer keys."""
    row = await repository.activity(connection, user_id=actor.user_id, activity_id=activity_id)
    if row is None:
        raise ApiError(404, "No activity was found")

    questions = await repository.questions_for(connection, activity_id)
    detail = ActivityDetail(
        **_summary(row), questions=[_question(question) for question in questions]
    )
    return {"data": detail.model_dump(mode="json")}


@router.post("/activities/{activity_id}/attempts", status_code=201)
async def start_attempt(
    actor: CurrentActor, connection: ActorDb, activity_id: UUID, response: Response
) -> dict[str, Any]:
    """Start an attempt, or resume the one already open.

    201 for a new attempt and 200 for a resumed one. A resumed attempt is
    recognised by the answers already saved against it.
    """
    _only_a_learner(actor)

    attempt_row = await repository.start_attempt(connection, activity_id)
    if attempt_row is None:
        raise ApiError(404, "No activity was found")

    saved = await repository.saved_answers(connection, attempt_row["attempt_id"])
    response.status_code = 200 if saved else 201

    delivery = AttemptDelivery(
        attempt_id=attempt_row["attempt_id"],
        status=str(attempt_row["status"]),
        attempt_number=attempt_row["attempt_number"],
        saved_answers={
            str(row["question_id"]): _json_value(row["answer"]) for row in saved
        },
        started_at=attempt_row["started_at"],
    )
    return {"data": delivery.model_dump(mode="json")}


@router.post("/activity-attempts/{attempt_id}/answer-checks")
async def check_answer(
    actor: CurrentActor, connection: ActorDb, attempt_id: UUID, body: AnswerCheckRequest
) -> dict[str, Any]:
    """Immediate deterministic feedback on one answer.

    The verdict and the authored explanation come from the database, which is
    the only place the answer key exists.
    """
    _only_a_learner(actor)

    row = await repository.check_answer(
        connection,
        attempt_id=attempt_id,
        question_id=body.question_id,
        answer=json.dumps(body.answer),
    )
    if row is None:
        raise ApiError(404, "No attempt of yours is in progress")

    check = AnswerCheck(
        is_correct=bool(row["is_correct"]),
        attempts_for_question=row["attempts_for_question"] or 0,
        # The authored explanation is the feedback; a separate authored feedback
        # field does not exist in the question bank, so it mirrors it rather
        # than inventing a second text.
        authored_feedback=row["explanation"],
        explanation=row["explanation"],
        hint_available=bool(row["hint_available"]),
        ai_feedback=None,
    )
    return {"data": check.model_dump(mode="json")}


@router.post("/activity-attempts/{attempt_id}/hints")
async def read_hint(
    actor: CurrentActor, connection: ActorDb, attempt_id: UUID, body: HintRequest
) -> dict[str, Any]:
    """The authored hint for one question. It never discloses the answer."""
    _only_a_learner(actor)

    text = await repository.hint(
        connection, attempt_id=attempt_id, question_id=body.question_id
    )
    return {
        "data": Hint(question_id=body.question_id, hint=text, ai_hint=None).model_dump(
            mode="json"
        )
    }


@router.post("/activity-attempts/{attempt_id}/submit")
async def submit_attempt(
    actor: CurrentActor, connection: ActorDb, attempt_id: UUID, body: SubmitActivityRequest
) -> dict[str, Any]:
    """Finalise the activity and apply the deterministic rules.

    The score, the pass decision, the competency aggregate and any automatic
    intervention are all the database's answer.
    """
    _only_a_learner(actor)

    row = await repository.submit_attempt(
        connection,
        attempt_id=attempt_id,
        answers=json.dumps(body.model_dump(mode="json")["answers"]),
        time_spent_seconds=body.time_spent_seconds,
    )
    if row is None:
        raise ApiError(404, "No attempt of yours is in progress")

    passed = bool(row["passed"])
    outcome = ActivityOutcome(
        attempt_id=row["attempt_id"],
        score=row["raw_score"] or 0,
        max_score=row["max_score"] or 0,
        accuracy=_percentage(row["score_percentage"]) or 0,
        passed=passed,
        attempt_number=row["attempt_number"],
        mastery_band=str(row["mastery_status"]) if row["mastery_status"] else None,
        previous_competency_score=_percentage(row["previous_competency_score"]),
        current_competency_score=_percentage(row["current_competency_score"]),
        intervention_created=bool(row["intervention_created"]),
        next_action=_next_action(passed),
    )
    return {"data": outcome.model_dump(mode="json")}


@router.get("/students/{student_id}/activity-attempts")
async def list_attempts_for_student(
    _actor: TeacherAdmin,
    connection: ActorDb,
    student_id: UUID,
    activity_id: Annotated[UUID | None, Query()] = None,
    competency_id: Annotated[UUID | None, Query()] = None,
    passed: Annotated[bool | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = DEFAULT_PAGE_SIZE,
) -> dict[str, Any]:
    """A named learner's activity history, with the documented filters."""
    offset = (page - 1) * page_size
    filters = {
        "student_id": student_id,
        "activity_id": activity_id,
        "competency_id": competency_id,
        "passed": passed,
    }
    rows = await repository.history(connection, limit=page_size, offset=offset, **filters)
    total = await repository.history_total(connection, **filters)

    return {
        "data": [
            ActivityAttemptSummary(
                attempt_id=row["attempt_id"],
                activity_id=row["activity_id"],
                title=row["title"],
                competency_id=row["competency_id"],
                competency_name=row["competency_name"],
                status=str(row["status"]),
                attempt_number=row["attempt_number"],
                score=row["raw_score"],
                max_score=row["max_score"],
                accuracy=_percentage(row["score_percentage"]),
                passed=row["passed"],
                time_spent_seconds=row["time_spent_seconds"] or 0,
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
