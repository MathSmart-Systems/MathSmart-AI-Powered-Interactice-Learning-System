"""Activity routes.

Everything a learner does here goes through a database function, for the same
two reasons throughout: the columns that decide correctness are ones the API
connection cannot read, and the learner's own records are SELECT-only for them.

`ai_feedback` and `ai_hint` are the only advisory fields in the module. They are
null unless Groq answered, and no score, band, pass decision or intervention
depends on them. `ai_hint` is wording placed beside the authored hint, never
instead of it, so a learner whose Groq call is off, slow or refused reads
exactly the hint their teacher wrote.
"""

from __future__ import annotations

import json
import logging
from typing import Annotated, Any
from uuid import UUID

import asyncpg
from fastapi import APIRouter, Query, Request, Response

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

# The one gate that decides whether Groq may be asked anything, imported rather
# than restated. A Teacher/Administrator who turns `features.groq_advisory` off
# means it off everywhere, and a second copy of that rule here would be a second
# thing to keep true.
from modules.ai.router import _is_groq_feature_enabled
from modules.competencies.schemas import PublicationStatus

# Practice belongs to a module, and a module the learner's path has not opened
# yet does not offer its practice either. `app.activity_attempts` refuses the
# insert with 55000 (object_not_in_prerequisite_state); the documented status
# table names 412 for locked content, so that is what the caller is told rather
# than a 500.
LOCKED_MESSAGE = (
    "This practice is not open yet. Finish the earlier lessons in your learning path first."
)
LOCKED_CODE = "content_locked"

#: What the adapter is asked to do. Wording is the whole of it: the hint itself
#: is authored, and Groq is given no say in what it says.
HINT_PURPOSE = "optional hint wording"

logger = logging.getLogger(__name__)

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
        question_count=row["question_count"] or 0,
        is_ready=bool(row["is_ready"]),
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


async def _advisory_hint(request: Request, *, actor: Any, authored: str | None) -> str | None:
    """Groq's rephrasing of an authored hint, or None.

    Advisory in the strict sense the module docstring means. It is returned
    beside the authored hint rather than in place of it, it decides nothing, and
    every way it can go wrong ends here as None rather than as a failed request.

    A question with no authored hint is one of those ways. There would be
    nothing to rephrase, and generating one anyway would leave a learner reading
    machine text with no authored wording behind it — the fallback is the point.

    Only the authored hint is sent. The answer key is not in this process at
    all: the hint arrives from a database function that reads the key and does
    not return it, so there is nothing here that could disclose it.
    """
    if not authored:
        return None

    if not await _is_groq_feature_enabled(request, actor):
        return None

    adviser = getattr(request.app.state, "groq", None)
    if adviser is None:
        return None

    try:
        result = await adviser.advise(
            purpose=HINT_PURPOSE,
            evidence={"grade": "Grade 6 mathematics", "authored_hint": authored},
        )
    except Exception:
        # The adapter is written to return None rather than raise. This catch is
        # what stops that promise from being something a learner's hint depends
        # on: if it is ever broken, the authored hint still arrives.
        logger.warning("Advisory hint wording failed; the authored hint is unaffected")
        return None

    return result.text if result is not None else None


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
        "module_id": module_id,
        "competency_id": competency_id,
        "status": status.value if status else None,
        "search": search,
    }
    rows = await repository.listing(
        connection, user_id=actor.user_id, limit=page_size, offset=offset, **filters
    )
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
    """One activity and its ordered questions, without answer keys.

    A learner part-way through gets the questions their attempt was started
    with, not the activity's current membership. The two can differ — a teacher
    can archive a question, and the attempt keeps grading the one it froze — and
    delivering the current set meant a learner could be marked on an item that
    had disappeared from their screen.
    """
    row = await repository.activity(connection, user_id=actor.user_id, activity_id=activity_id)
    if row is None:
        raise ApiError(404, "No activity was found")

    questions = []
    if actor.role is MathSmartRole.STUDENT:
        questions = await repository.attempt_questions(
            connection, activity_id=activity_id, user_id=actor.user_id
        )

    if not questions:
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

    try:
        attempt_row = await repository.start_attempt(connection, activity_id)
    except asyncpg.ObjectNotInPrerequisiteStateError as exc:
        raise ApiError(412, LOCKED_MESSAGE, code=LOCKED_CODE) from exc
    except asyncpg.NoDataFoundError as exc:
        # The activity, its module or its competency is not published. To a
        # learner that is indistinguishable from it not existing, and saying
        # so is better than the generic failure this used to become.
        raise ApiError(404, "No activity was found") from exc
    except asyncpg.AssertError as exc:
        # The activity exists but cannot be delivered: it has no questions, or
        # some of them are unpublished, or an attempt opened before the
        # question snapshot existed is still sitting there. None of that is
        # the learner's doing and none of it is a server fault, so it must not
        # arrive as "the request could not be completed" — which is all this
        # said before, on every one of these paths.
        raise ApiError(
            409,
            "This practice is not ready yet. Ask your teacher to finish setting it up.",
            code="activity_not_ready",
        ) from exc
    except asyncpg.InsufficientPrivilegeError as exc:
        raise ApiError(403, "This action belongs to a learner") from exc
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
        # Null deliberately. The player asks `/ai/incorrect-answer-explanation`
        # itself once it has this verdict, so advising here would make the
        # verdict wait on Groq for text the learner is about to be offered
        # anyway — and the verdict is the thing that must never wait.
        ai_feedback=None,
    )
    return {"data": check.model_dump(mode="json")}


@router.post("/activity-attempts/{attempt_id}/hints")
async def read_hint(
    actor: CurrentActor,
    connection: ActorDb,
    request: Request,
    attempt_id: UUID,
    body: HintRequest,
) -> dict[str, Any]:
    """The authored hint for one question, and optionally a rephrasing of it.

    Neither discloses the answer. `hint` is the authored text and is what the
    learner reads; `ai_hint` is extra wording offered beside it and is null
    whenever Groq is disabled, silent, slow or unexpected.

    The adapter is on `app.state`, so this handler takes the `Request` every
    other Groq caller takes rather than a new injected dependency. A dependency
    would be a second route to the same singleton, and the feature gate shared
    with `/ai/*` needs the request regardless.
    """
    _only_a_learner(actor)

    text = await repository.hint(
        connection, attempt_id=attempt_id, question_id=body.question_id
    )
    return {
        "data": Hint(
            question_id=body.question_id,
            hint=text,
            ai_hint=await _advisory_hint(request, actor=actor, authored=text),
        ).model_dump(mode="json")
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
        # The identifier is the one that was asked for; the function does not
        # return it, so it cannot collide with the column of the same name.
        attempt_id=attempt_id,
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
