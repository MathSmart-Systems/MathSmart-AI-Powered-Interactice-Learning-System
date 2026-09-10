"""Request and response contracts for the advisory Groq routes.

Every request model forbids extra fields, which is how a request that tries to
name a model or carry a credential is rejected rather than ignored. The model
and the API key are deployment configuration read from the server environment;
there is nowhere in these shapes to put either.

Every response carries provenance — provider, model, generated_at — because
advisory text without provenance is indistinguishable from an authored fact.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

MAX_TEXT = 2000
MAX_ATTEMPTS = 20


class IncorrectAttempt(BaseModel):
    """One wrong answer, as the workflow already displayed it."""

    model_config = ConfigDict(extra="forbid")

    question_text: str = Field(max_length=MAX_TEXT)
    submitted_answer: Any = None
    correct_answer: Any = None


class PatternAnalysisRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    grade: str | None = Field(default=None, max_length=60)
    competency_id: UUID | None = None
    display_context: str | None = Field(default=None, max_length=MAX_TEXT)
    incorrect_attempts: list[IncorrectAttempt] = Field(
        default_factory=list, max_length=MAX_ATTEMPTS
    )


class StudentFeedbackRequest(BaseModel):
    """Called only after deterministic grading has already decided the score."""

    model_config = ConfigDict(extra="forbid")

    competency_id: UUID | None = None
    score: float | None = Field(default=None, ge=0, le=100)
    mastery_band: str | None = Field(default=None, max_length=40)
    display_context: str | None = Field(default=None, max_length=MAX_TEXT)


class AnswerExplanationRequest(BaseModel):
    """For a completed answer check. It cannot change the verdict it is given."""

    model_config = ConfigDict(extra="forbid")

    question_text: str = Field(max_length=MAX_TEXT)
    submitted_answer: Any = None
    is_correct: bool | None = None
    competency_id: UUID | None = None


class TeacherInsightRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    competency_id: UUID | None = None
    diagnostic_score: float | None = Field(default=None, ge=0, le=100)
    current_score: float | None = Field(default=None, ge=0, le=100)
    attempt_count: int | None = Field(default=None, ge=0)
    unsuccessful_attempts: int | None = Field(default=None, ge=0)
    incorrect_patterns: list[Any] = Field(default_factory=list, max_length=MAX_ATTEMPTS)
    completed_modules: list[Any] = Field(default_factory=list, max_length=MAX_ATTEMPTS)
    display_context: str | None = Field(default=None, max_length=MAX_TEXT)


class RemediationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    competency_id: UUID | None = None
    current_score: float | None = Field(default=None, ge=0, le=100)
    display_context: str | None = Field(default=None, max_length=MAX_TEXT)


class Provenance(BaseModel):
    """Where advisory text came from, and when."""

    provider: str
    model: str
    generated_at: datetime
    confidence_score: float | None = None
