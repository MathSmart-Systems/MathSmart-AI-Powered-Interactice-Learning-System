"""Request and response contracts for the students module."""

from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class EnrolLearnerRequest(BaseModel):
    """What a Teacher/Administrator supplies to enrol a learner.

    There is deliberately no `role` field. The role is not something a request
    may choose: this endpoint provisions learners, and the trusted claim is set
    by the server. `extra="forbid"` means a request that tries to smuggle one is
    rejected rather than silently ignored.
    """

    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    full_name: str = Field(min_length=2, max_length=120)
    learner_id: str = Field(min_length=4, max_length=32)
    grade_id: UUID
    section_id: UUID | None = None
    school_name: str | None = Field(default=None, min_length=2, max_length=160)


class LearnerSummary(BaseModel):
    """A learner as the roster and the enrolment response present them."""

    student_id: UUID
    user_id: UUID
    learner_id: str
    full_name: str | None = None
    grade_id: UUID | None = None
    section_id: UUID | None = None
    monitoring_status: str | None = None
    diagnostic_status: str | None = None
