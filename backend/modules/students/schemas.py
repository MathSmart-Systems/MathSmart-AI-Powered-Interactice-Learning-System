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


class OwnProfileChanges(BaseModel):
    """What a learner may change about themselves.

    One field, because one column is what `authenticated` may write on its own
    profile. There is no role, no account status and no learner id here, and
    `extra="forbid"` means asking for one is refused rather than ignored.
    """

    model_config = ConfigDict(extra="forbid")

    full_name: str = Field(min_length=2, max_length=120)


class LearnerRecordChanges(BaseModel):
    """What a Teacher/Administrator may change about a learner's enrolment.

    The school's own facts: which class they are in, which grade, and how they
    are being monitored. Not who they are, and not whether they may sign in.
    """

    model_config = ConfigDict(extra="forbid")

    grade_id: UUID | None = None
    section_id: UUID | None = None
    monitoring_status: str | None = Field(default=None, min_length=2, max_length=40)
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
