"""Groq assistance routes.

Advisory, and only advisory. Nothing here decides correctness, a score, a
mastery band, an unlock, an intervention trigger, a role or a permission — and
the routes that do decide those never call these. That is why a failure here is
a plain 503 rather than a problem: the deterministic answer already exists, and
no learning transaction depends on this one succeeding.

The credential and the selected model are `.env` values read by the adapter. No
request can supply either, and no response returns either beyond the model name
the documentation asks for as provenance.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Request

from app.dependencies import CurrentActor, TeacherAdmin
from middleware.errors import ApiError
from modules.ai.schemas import (
    AnswerExplanationRequest,
    PatternAnalysisRequest,
    Provenance,
    RemediationRequest,
    StudentFeedbackRequest,
    TeacherInsightRequest,
)

router = APIRouter(tags=["ai"])

UNAVAILABLE = "groq_assistance_unavailable"


def _groq(request: Request) -> Any:
    adviser = request.app.state.groq
    if adviser is None:
        raise ApiError(503, "AI assistance is not available", code=UNAVAILABLE)
    return adviser


def _evidence(model: Any) -> dict[str, Any]:
    """The request as evidence, with identifiers stringified for the prompt.

    The adapter redacts by key before anything leaves the process; this simply
    hands it what the request supplied.
    """
    evidence = model.model_dump(mode="json", exclude_none=True)
    return {
        key: str(value) if isinstance(value, UUID) else value
        for key, value in evidence.items()
    }


async def _advise(request: Request, *, purpose: str, model: Any) -> Any:
    adviser = _groq(request)
    result = await adviser.advise(purpose=purpose, evidence=_evidence(model))
    if result is None:
        # Disabled, timed out, rate limited, or answering in a shape we did not
        # expect. All the same to the caller, and none of them a failure of the
        # deterministic result they already have.
        raise ApiError(503, "AI assistance is not available", code=UNAVAILABLE)
    return result


def _provenance(result: Any) -> dict[str, Any]:
    return Provenance(
        provider=result.provider,
        model=result.model,
        generated_at=result.generated_at,
        confidence_score=result.confidence,
    ).model_dump(mode="json")


@router.post("/ai/pattern-analysis")
async def pattern_analysis(
    _actor: TeacherAdmin, request: Request, body: PatternAnalysisRequest
) -> dict[str, Any]:
    """Advisory analysis of a learner's incorrect attempts."""
    result = await _advise(request, purpose="pattern analysis", model=body)
    return {
        "data": {
            "misconception_summary": result.text,
            "root_cause": None,
            "recommended_remediation": None,
            **_provenance(result),
        }
    }


@router.post("/ai/student-feedback")
async def student_feedback(
    _actor: CurrentActor, request: Request, body: StudentFeedbackRequest
) -> dict[str, Any]:
    """Encouraging phrasing for a score that has already been decided."""
    result = await _advise(request, purpose="student feedback", model=body)
    return {
        "data": {
            "feedback_text": result.text,
            "friendly_tip": None,
            "encouragement": None,
            **_provenance(result),
        }
    }


@router.post("/ai/incorrect-answer-explanation")
async def incorrect_answer_explanation(
    _actor: CurrentActor, request: Request, body: AnswerExplanationRequest
) -> dict[str, Any]:
    """A bounded explanation for a completed answer check.

    The verdict is an input, not an output: this response has no `is_correct`
    and no score, so it cannot change either.
    """
    result = await _advise(request, purpose="incorrect answer explanation", model=body)
    return {"data": {"explanation": result.text, **_provenance(result)}}


@router.post("/ai/teacher-insight")
async def teacher_insight(
    _actor: TeacherAdmin, request: Request, body: TeacherInsightRequest
) -> dict[str, Any]:
    """Advisory insight for an educator looking at one learner and competency."""
    result = await _advise(request, purpose="teacher insight", model=body)
    return {
        "data": {
            "insight_summary": result.text,
            "learning_gaps": [],
            "suggested_intervention_type": None,
            "recommended_actions": [],
            "urgency_level": None,
            **_provenance(result),
        }
    }


@router.post("/ai/remediation-support")
async def remediation_support(
    _actor: TeacherAdmin, request: Request, body: RemediationRequest
) -> dict[str, Any]:
    """Advisory remediation suggestions for an educator."""
    result = await _advise(request, purpose="remediation support", model=body)
    return {
        "data": {
            "recommended_module_title": result.text,
            "targeted_practice_focus": None,
            "visual_metaphor_advice": None,
            "scaffolding_steps": [],
            **_provenance(result),
        }
    }
