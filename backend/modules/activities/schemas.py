"""Request and response contracts for the activities module.

As in the assessments module, the shapes here cannot express an answer key, a
correct answer, or a learner other than the caller. `ai_feedback` is present and
optional because the route contract has a place for advisory phrasing; nothing
depends on it, and it is null whenever Groq is off or silent.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

MAX_ANSWERS = 500
MAX_TIME_SPENT_SECONDS = 86_400


class ActivitySummary(BaseModel):
    """An activity as the catalogue presents it, with the caller's standing."""

    id: UUID
    module_id: UUID
    module_title: str | None = None
    competency_id: UUID | None = None
    competency_name: str | None = None
    title: str
    description: str | None = None
    estimated_minutes: int
    points: int
    mastery_threshold: int
    status: str
    attempt_count: int = 0
    best_score: float | None = None
    path_status: str | None = None


class DeliveredQuestion(BaseModel):
    """A question as a learner sees it inside an activity."""

    id: UUID
    competency_id: UUID
    competency_name: str | None = None
    text: str
    type: str
    choices: list[Any] = []
    difficulty: str
    visual_aid_description: str | None = None


class ActivityDetail(ActivitySummary):
    """An activity with its ordered questions."""

    questions: list[DeliveredQuestion] = []


class AttemptDelivery(BaseModel):
    """A started or resumed activity attempt."""

    attempt_id: UUID
    status: str
    attempt_number: int
    saved_answers: dict[str, Any] = {}
    started_at: datetime | None = None


class AnswerCheckRequest(BaseModel):
    """One answer, checked for immediate feedback. No learner field."""

    model_config = ConfigDict(extra="forbid")

    question_id: UUID
    answer: Any = None


class AnswerCheck(BaseModel):
    """The deterministic verdict, plus advisory phrasing when there is any."""

    is_correct: bool
    attempts_for_question: int
    authored_feedback: str | None = None
    explanation: str | None = None
    hint_available: bool = False
    ai_feedback: str | None = None


class HintRequest(BaseModel):
    """A request for the authored hint on one question."""

    model_config = ConfigDict(extra="forbid")

    question_id: UUID


class Hint(BaseModel):
    """The authored hint, which never discloses the answer and changes no score."""

    question_id: UUID
    hint: str | None = None
    ai_hint: str | None = None


class SubmittedAnswer(BaseModel):
    model_config = ConfigDict(extra="forbid")

    question_id: UUID
    answer: Any = None


class SubmitActivityRequest(BaseModel):
    """Final answers and how long the learner spent. No learner field."""

    model_config = ConfigDict(extra="forbid")

    answers: list[SubmittedAnswer] = Field(default_factory=list, max_length=MAX_ANSWERS)
    time_spent_seconds: int = Field(default=0, ge=0, le=MAX_TIME_SPENT_SECONDS)


class ActivityOutcome(BaseModel):
    """What a finished activity attempt produced."""

    attempt_id: UUID
    score: int
    max_score: int
    accuracy: float
    passed: bool
    attempt_number: int
    mastery_band: str | None = None
    previous_competency_score: float | None = None
    current_competency_score: float | None = None
    intervention_created: bool = False
    next_action: dict[str, str] | None = None


class ActivityAttemptSummary(BaseModel):
    """An activity attempt as the history list presents it."""

    attempt_id: UUID
    activity_id: UUID
    title: str | None = None
    competency_id: UUID | None = None
    competency_name: str | None = None
    status: str
    attempt_number: int
    score: int | None = None
    max_score: int | None = None
    accuracy: float | None = None
    passed: bool | None = None
    time_spent_seconds: int = 0
    submitted_at: datetime | None = None
