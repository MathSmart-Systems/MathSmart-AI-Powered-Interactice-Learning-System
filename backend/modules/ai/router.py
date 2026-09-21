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

from fastapi import APIRouter, Request

from app.dependencies import CurrentActor, TeacherAdmin
from modules.ai.schemas import (
    AnswerExplanationRequest,
    PatternAnalysisRequest,
    RemediationRequest,
    StudentFeedbackRequest,
    TeacherInsightRequest,
)
from modules.ai.service import UNAVAILABLE, provenance_of, request_advice

router = APIRouter(tags=["ai"])

__all__ = ["UNAVAILABLE", "router"]


@router.post("/ai/pattern-analysis")
async def pattern_analysis(
    actor: TeacherAdmin, request: Request, body: PatternAnalysisRequest
) -> dict[str, Any]:
    """Advisory analysis of a learner's incorrect attempts."""
    result = await request_advice(request, purpose="pattern analysis", model=body, actor=actor)
    return {
        "data": {
            "misconception_summary": result.text,
            "root_cause": None,
            "recommended_remediation": None,
            **provenance_of(result),
        }
    }


@router.post("/ai/student-feedback")
async def student_feedback(
    actor: CurrentActor, request: Request, body: StudentFeedbackRequest
) -> dict[str, Any]:
    """Encouraging phrasing for a score that has already been decided."""
    result = await request_advice(request, purpose="student feedback", model=body, actor=actor)
    return {
        "data": {
            "feedback_text": result.text,
            "friendly_tip": None,
            "encouragement": None,
            **provenance_of(result),
        }
    }


@router.post("/ai/incorrect-answer-explanation")
async def incorrect_answer_explanation(
    actor: CurrentActor, request: Request, body: AnswerExplanationRequest
) -> dict[str, Any]:
    """A bounded explanation for a completed answer check.

    The verdict is an input, not an output: this response has no `is_correct`
    and no score, so it cannot change either.
    """
    result = await request_advice(
        request, purpose="incorrect answer explanation", model=body, actor=actor
    )
    return {"data": {"explanation": result.text, **provenance_of(result)}}


@router.post("/ai/teacher-insight")
async def teacher_insight(
    actor: TeacherAdmin, request: Request, body: TeacherInsightRequest
) -> dict[str, Any]:
    """Advisory insight for an educator looking at one learner and competency."""
    result = await request_advice(request, purpose="teacher insight", model=body, actor=actor)
    return {
        "data": {
            "insight_summary": result.text,
            "learning_gaps": [],
            "suggested_intervention_type": None,
            "recommended_actions": [],
            "urgency_level": None,
            **provenance_of(result),
        }
    }


@router.post("/ai/remediation-support")
async def remediation_support(
    actor: TeacherAdmin, request: Request, body: RemediationRequest
) -> dict[str, Any]:
    """Advisory remediation suggestions for an educator."""
    result = await request_advice(request, purpose="remediation support", model=body, actor=actor)
    return {
        "data": {
            "recommended_module_title": result.text,
            "targeted_practice_focus": None,
            "visual_metaphor_advice": None,
            "scaffolding_steps": [],
            **provenance_of(result),
        }
    }
