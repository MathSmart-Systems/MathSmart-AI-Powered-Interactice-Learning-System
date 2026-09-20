"""Request and response contracts for the students module."""

from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator


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


#: How many learners one request may drop by name. A whole section is asked for
#: by `section_id` instead, so this bound is not a ceiling on the real work —
#: it only stops an arbitrarily long list of ids arriving in one body.
MAX_DROP_BATCH = 500


class DropLearnersRequest(BaseModel):
    """Which learners to drop.

    Two ways of saying it, and exactly one per request. `user_ids` names
    accounts; `section_id` names a section and lets the database decide who is
    in it. The second exists because the roster is paginated: a browser that
    expanded a section into ids would send the page it had loaded and silently
    leave the rest of the section enrolled.
    """

    model_config = ConfigDict(extra="forbid")

    user_ids: list[UUID] | None = Field(default=None, max_length=MAX_DROP_BATCH)
    section_id: UUID | None = None

    @model_validator(mode="after")
    def exactly_one_target(self) -> "DropLearnersRequest":
        named = self.user_ids is not None
        sectioned = self.section_id is not None
        if named and sectioned:
            raise ValueError("Name either user_ids or section_id, not both.")
        if not named and not sectioned:
            raise ValueError("Name either user_ids or section_id.")
        if named and not self.user_ids:
            raise ValueError("user_ids cannot be empty.")
        return self


class RestoreLearnerRequest(BaseModel):
    """Where a dropped learner is being put back.

    The section is required rather than inferred. A learner's former section
    may have been retired or may belong to another grade by the time anyone
    restores them, and silently reusing it would put them somewhere the
    curriculum does not reach. The caller names the destination; the server
    still checks it against the Grade 6 scope.
    """

    model_config = ConfigDict(extra="forbid")

    section_id: UUID


class PurgeLearnerRequest(BaseModel):
    """The typed confirmation for a permanent purge.

    Only a confirmation. The learner being purged is the one the path names —
    this value is compared against the record the server reads for itself, so a
    tampered body can cause a refusal but never a different target.
    """

    model_config = ConfigDict(extra="forbid")

    learner_id: str = Field(min_length=1, max_length=32)
    acknowledged: bool = Field(default=False)

    @model_validator(mode="after")
    def must_be_acknowledged(self) -> "PurgeLearnerRequest":
        if not self.acknowledged:
            raise ValueError("This action must be acknowledged before it can be carried out.")
        return self


class LearnerSummary(BaseModel):
    """A learner as the roster and the enrolment response present them."""

    student_id: UUID
    user_id: UUID
    learner_id: str
    full_name: str | None = None
    grade_id: UUID | None = None
    section_id: UUID | None = None
    grade_name: str | None = None
    section_name: str | None = None
    school_name: str | None = None
    monitoring_status: str | None = None
    diagnostic_status: str | None = None
    #: Whether the account is still usable. A dropped learner is archived
    #: rather than deleted — their recorded work is referenced by seven tables
    #: and every one of those references is ON DELETE RESTRICT — so the roster
    #: needs to be able to say which learners those are.
    account_status: str | None = None
