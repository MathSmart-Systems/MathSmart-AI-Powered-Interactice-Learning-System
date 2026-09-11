"""Request and response contracts for the assessments module.

Note what these models cannot express. There is no field on a delivered
question for an answer key, a correct answer, an explanation or a hint, and no
field on an attempt request for a learner. That is not decoration: a response
model that cannot hold a secret cannot leak one by accident.
"""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

MAX_ANSWERS = 500
MAX_REASON_LENGTH = 1000


class AssessmentType(StrEnum):
    """Mirrors `app.assessment_type`."""

    DIAGNOSTIC = "diagnostic"
    REASSESSMENT = "reassessment"
    UNIT_QUIZ = "unit_quiz"


class AssessmentSummary(BaseModel):
    """An assessment as the catalogue presents it, with the caller's standing."""

    id: UUID
    grade_id: UUID
    title: str
    type: str
    status: str
    duration_minutes: int
    description: str | None = None
    total_questions: int = 0
    attempt_count: int = 0
    latest_attempt_id: UUID | None = None
    latest_status: str | None = None


class DeliveredQuestion(BaseModel):
    """A question as a learner sees it during an attempt.

    Deliberately incomplete: the answer key, the explanation and the hint are
    withheld from the API connection by a column privilege, so they are not
    available to put here even by mistake.
    """

    id: UUID
    competency_id: UUID
    competency_name: str | None = None
    text: str
    type: str
    choices: list[Any] = []
    difficulty: str
    visual_aid_description: str | None = None
    position: int


class AttemptDelivery(BaseModel):
    """A started or resumed attempt, with its questions and saved answers."""

    attempt_id: UUID
    assessment: dict[str, Any]
    questions: list[DeliveredQuestion] = []
    saved_answers: dict[str, Any] = {}
    started_at: datetime | None = None


class SubmittedAnswer(BaseModel):
    """One answer, for autosave or submission."""

    model_config = ConfigDict(extra="forbid")

    question_id: UUID
    answer: Any = None


class SaveAnswersRequest(BaseModel):
    """Autosave. There is no learner field: the attempt is the caller's own."""

    model_config = ConfigDict(extra="forbid")

    answers: list[SubmittedAnswer] = Field(default_factory=list, max_length=MAX_ANSWERS)


class CompetencyResult(BaseModel):
    """The deterministic outcome for one competency in one attempt."""

    competency_id: UUID
    competency_name: str | None = None
    raw_score: int
    max_score: int
    percentage: float
    mastery_band: str


class PathItem(BaseModel):
    """One item of the targeted learning path."""

    id: UUID
    priority: int
    reason: str | None = None
    status: str
    competency: dict[str, Any]
    module: dict[str, Any]


class AttemptReport(BaseModel):
    """A scored attempt, as the submission response and the read-back present it."""

    attempt_id: UUID
    assessment_id: UUID
    status: str
    overall_score: float | None = None
    started_at: datetime | None = None
    submitted_at: datetime | None = None
    competency_results: list[CompetencyResult] = []
    recommended_learning_path: list[PathItem] = []
    next_action: dict[str, str] | None = None


class AttemptSummary(BaseModel):
    """An attempt as the history list presents it."""

    attempt_id: UUID
    assessment_id: UUID
    title: str | None = None
    type: str | None = None
    status: str
    overall_score: float | None = None
    started_at: datetime | None = None
    submitted_at: datetime | None = None


class DiagnosticStatus(BaseModel):
    """Where a learner stands on a diagnostic assessment."""

    status: str
    assessment_id: UUID | None = None
    latest_attempt_id: UUID | None = None
    latest_status: str | None = None
    latest_score: float | None = None
    reassessment_eligible: bool = False
    reassessment_reason: str | None = None


class AuthoriseReassessmentRequest(BaseModel):
    """A Teacher/Administrator's decision, with the reason it was made.

    The educator is not a field. It comes from the verified token, and the
    database records whoever actually called.
    """

    model_config = ConfigDict(extra="forbid")

    assessment_id: UUID
    reason: str = Field(min_length=3, max_length=MAX_REASON_LENGTH)
    expires_at: datetime | None = None


class ReassessmentAuthorization(BaseModel):
    """A recorded authorization."""

    id: UUID
    student_id: UUID
    assessment_id: UUID
    reason: str
    granted_at: datetime | None = None
    expires_at: datetime | None = None
