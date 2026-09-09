"""Request and response contracts for the interventions module.

The request models carry the educator's decision and nothing else. There is no
field for the educator, because that comes from the verified token, and no field
for advisory text, because Groq output is written by the AI routes and never
asserted by a caller.
"""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

MAX_NOTES_LENGTH = 4000
MAX_REASON_LENGTH = 1000


class Severity(StrEnum):
    """Mirrors `app.intervention_severity`."""

    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"


class CaseStatus(StrEnum):
    """Mirrors `app.intervention_status`."""

    NEEDS_INTERVENTION = "Needs Intervention"
    IN_PROGRESS = "In Progress"
    RESOLVED = "Resolved"


class InterventionType(StrEnum):
    """Mirrors `app.intervention_type`."""

    ADDITIONAL_EXERCISE = "Additional Exercise"
    ONE_ON_ONE = "One-on-One Remediation"
    ADDITIONAL_MODULE = "Additional Module"
    TEACHER_CONSULTATION = "Teacher Consultation"
    OTHER = "Other"


class RecordInterventionRequest(BaseModel):
    """A manual case, or the first recorded action on an automatic one."""

    model_config = ConfigDict(extra="forbid")

    student_id: UUID
    competency_id: UUID
    severity: Severity
    intervention_type: InterventionType
    educator_notes: str | None = Field(default=None, max_length=MAX_NOTES_LENGTH)


class UpdateInterventionRequest(BaseModel):
    """A change within the documented lifecycle."""

    model_config = ConfigDict(extra="forbid")

    severity: Severity | None = None
    intervention_type: InterventionType | None = None
    educator_notes: str | None = Field(default=None, max_length=MAX_NOTES_LENGTH)
    status: CaseStatus | None = None
    reopen_reason: str | None = Field(default=None, min_length=3, max_length=MAX_REASON_LENGTH)


class InterventionSummary(BaseModel):
    """A case as the queue presents it."""

    id: UUID
    student: dict[str, Any]
    competency: dict[str, Any]
    severity: str
    status: str
    intervention_type: str
    recorded_by: str | None = None
    recorded_at: datetime | None = None
    created_at: datetime | None = None
    resolved_at: datetime | None = None


class InterventionDetail(InterventionSummary):
    """A case with the evidence behind it and any advisory text."""

    evidence: dict[str, Any] = {}
    incorrect_patterns: list[Any] = []
    modules_attempted: list[Any] = []
    educator_notes: str | None = None
    reopen_reason: str | None = None
    ai_insight: str | None = None
    ai_recommendation: str | None = None
    ai_provider: str | None = None
    ai_model: str | None = None
    ai_confidence_score: float | None = None
