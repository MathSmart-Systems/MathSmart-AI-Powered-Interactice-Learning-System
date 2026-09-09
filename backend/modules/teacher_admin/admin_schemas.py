"""Request contracts for Teacher/Administrator administration.

Every model forbids extra fields, so a request that tries to set an identifier,
a version, or somebody's role is rejected rather than silently ignored. None of
them has a field for an actor: who did it comes from the verified token.
"""

from __future__ import annotations

from enum import StrEnum
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

MAX_TITLE = 300
MAX_TEXT = 4000
MAX_SETTINGS = 40

#: Reserved in the data contract but not deliverable, so nothing using them may
#: reach a learner. The database says the same thing with a CHECK constraint;
#: this is the earlier, clearer refusal.
PUBLISHABLE_QUESTION_TYPES = {"multiple_choice", "number_input", "fill_blank"}

#: The only namespaces app.system_settings accepts. Credentials and the Groq
#: model are `.env` values and can never be stored here.
SETTING_NAMESPACES = ("thresholds", "intervention", "notifications", "features")


class PublicationStatus(StrEnum):
    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"


class AccountStatus(StrEnum):
    ACTIVE = "active"
    SUSPENDED = "suspended"
    ARCHIVED = "archived"


class UserRole(StrEnum):
    STUDENT = "student"
    TEACHER_ADMIN = "teacher_admin"


class CompetencyDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str = Field(min_length=3, max_length=64)
    name: str = Field(min_length=2, max_length=MAX_TITLE)
    grade_id: UUID
    domain: str = Field(min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=MAX_TEXT)
    prerequisite_ids: list[UUID] = Field(default_factory=list)
    status: PublicationStatus = PublicationStatus.DRAFT


class CompetencyChanges(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str | None = Field(default=None, min_length=3, max_length=64)
    name: str | None = Field(default=None, min_length=2, max_length=MAX_TITLE)
    grade_id: UUID | None = None
    domain: str | None = Field(default=None, min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=MAX_TEXT)
    prerequisite_ids: list[UUID] | None = None
    status: PublicationStatus | None = None


class ModuleDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")

    competency_id: UUID
    title: str = Field(min_length=2, max_length=MAX_TITLE)
    estimated_minutes: int = Field(ge=1, le=600)
    learning_objective: str = Field(min_length=2, max_length=MAX_TEXT)
    short_explanation: str = Field(min_length=2, max_length=MAX_TEXT)
    rules: list[Any] = Field(default_factory=list)
    worked_examples: list[Any] = Field(default_factory=list)
    order_index: int = Field(ge=0)
    status: PublicationStatus = PublicationStatus.DRAFT


class ModuleChanges(BaseModel):
    model_config = ConfigDict(extra="forbid")

    competency_id: UUID | None = None
    title: str | None = Field(default=None, min_length=2, max_length=MAX_TITLE)
    estimated_minutes: int | None = Field(default=None, ge=1, le=600)
    learning_objective: str | None = Field(default=None, min_length=2, max_length=MAX_TEXT)
    short_explanation: str | None = Field(default=None, min_length=2, max_length=MAX_TEXT)
    rules: list[Any] | None = None
    worked_examples: list[Any] | None = None
    order_index: int | None = Field(default=None, ge=0)
    status: PublicationStatus | None = None


class ActivityDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")

    module_id: UUID
    title: str = Field(min_length=2, max_length=MAX_TITLE)
    description: str | None = Field(default=None, max_length=MAX_TEXT)
    estimated_minutes: int = Field(ge=1, le=600)
    points: int = Field(default=0, ge=0)
    mastery_threshold: int = Field(default=75, ge=1, le=100)
    status: PublicationStatus = PublicationStatus.DRAFT


class ActivityChanges(BaseModel):
    model_config = ConfigDict(extra="forbid")

    module_id: UUID | None = None
    title: str | None = Field(default=None, min_length=2, max_length=MAX_TITLE)
    description: str | None = Field(default=None, max_length=MAX_TEXT)
    estimated_minutes: int | None = Field(default=None, ge=1, le=600)
    points: int | None = Field(default=None, ge=0)
    mastery_threshold: int | None = Field(default=None, ge=1, le=100)
    status: PublicationStatus | None = None


class QuestionDraft(BaseModel):
    """A question, including the answer key it is authored with.

    The key is written and never read back: `authenticated` holds an INSERT and
    UPDATE privilege on that column and no SELECT privilege at all.
    """

    model_config = ConfigDict(extra="forbid")

    competency_id: UUID
    question_type: str = Field(min_length=2, max_length=40)
    difficulty: str = Field(default="medium", min_length=2, max_length=20)
    prompt: str = Field(min_length=2, max_length=MAX_TEXT)
    choices: list[Any] = Field(default_factory=list)
    answer_key: Any
    explanation: str | None = Field(default=None, max_length=MAX_TEXT)
    hint: str | None = Field(default=None, max_length=1000)
    visual_aid_description: str | None = Field(default=None, max_length=1000)
    status: PublicationStatus = PublicationStatus.DRAFT

    @model_validator(mode="after")
    def only_supported_types_may_be_published(self) -> QuestionDraft:
        if (
            self.status is PublicationStatus.PUBLISHED
            and self.question_type not in PUBLISHABLE_QUESTION_TYPES
        ):
            raise ValueError(
                "Only multiple_choice, number_input and fill_blank questions may be published"
            )
        return self


class QuestionChanges(BaseModel):
    model_config = ConfigDict(extra="forbid")

    competency_id: UUID | None = None
    question_type: str | None = Field(default=None, min_length=2, max_length=40)
    difficulty: str | None = Field(default=None, min_length=2, max_length=20)
    prompt: str | None = Field(default=None, min_length=2, max_length=MAX_TEXT)
    choices: list[Any] | None = None
    answer_key: Any = None
    explanation: str | None = Field(default=None, max_length=MAX_TEXT)
    hint: str | None = Field(default=None, max_length=1000)
    visual_aid_description: str | None = Field(default=None, max_length=1000)
    status: PublicationStatus | None = None


class AssessmentDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")

    grade_id: UUID
    title: str = Field(min_length=2, max_length=MAX_TITLE)
    assessment_type: str = Field(min_length=2, max_length=40)
    duration_minutes: int = Field(ge=1, le=480)
    description: str | None = Field(default=None, max_length=MAX_TEXT)
    status: PublicationStatus = PublicationStatus.DRAFT


class AssessmentChanges(BaseModel):
    model_config = ConfigDict(extra="forbid")

    grade_id: UUID | None = None
    title: str | None = Field(default=None, min_length=2, max_length=MAX_TITLE)
    assessment_type: str | None = Field(default=None, min_length=2, max_length=40)
    duration_minutes: int | None = Field(default=None, ge=1, le=480)
    description: str | None = Field(default=None, max_length=MAX_TEXT)
    status: PublicationStatus | None = None


class AssessmentQuestions(BaseModel):
    """The ordered membership, replaced as a whole.

    The whole list is replaced, so an empty one would leave an assessment with
    nothing to deliver — the state publication is already refused for — and at
    least one question is required here instead. A question is seated once: the
    membership is keyed on the assessment and the question together.
    """

    model_config = ConfigDict(extra="forbid")

    question_ids: list[UUID] = Field(min_length=1, max_length=200)

    @field_validator("question_ids")
    @classmethod
    def each_question_is_listed_once(cls, question_ids: list[UUID]) -> list[UUID]:
        if len(set(question_ids)) != len(question_ids):
            raise ValueError("An assessment may list each question only once")
        return question_ids


class GradeDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=2, max_length=60)
    level: int = Field(ge=1, le=12)
    is_active: bool = True


class GradeChanges(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=2, max_length=60)
    level: int | None = Field(default=None, ge=1, le=12)
    is_active: bool | None = None


class SectionDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")

    grade_id: UUID
    name: str = Field(min_length=1, max_length=60)
    adviser_id: UUID | None = None
    is_active: bool = True


class SectionChanges(BaseModel):
    model_config = ConfigDict(extra="forbid")

    grade_id: UUID | None = None
    name: str | None = Field(default=None, min_length=1, max_length=60)
    adviser_id: UUID | None = None
    is_active: bool | None = None


class UserChanges(BaseModel):
    """What a Teacher/Administrator may change about an account.

    There is deliberately no `role`. A learner's role is set from a trusted
    claim when the account is provisioned, and changing it would need a profile
    this endpoint has no way to supply.
    """

    model_config = ConfigDict(extra="forbid")

    account_status: AccountStatus | None = None


class SettingsChanges(BaseModel):
    """Safe operational configuration only.

    The namespaces are the ones the database accepts. A credential or a model
    identifier is a `.env` value; there is nowhere here to put one.
    """

    model_config = ConfigDict(extra="forbid")

    settings: dict[str, Any] = Field(min_length=1, max_length=MAX_SETTINGS)

    @model_validator(mode="after")
    def only_safe_namespaces(self) -> SettingsChanges:
        for key in self.settings:
            namespace = key.split(".", 1)[0]
            if namespace not in SETTING_NAMESPACES:
                raise ValueError(
                    "A setting key must be in one of: " + ", ".join(SETTING_NAMESPACES)
                )
        return self


class DiagnosticResetRequest(BaseModel):
    """Voiding a learner's diagnostic needs a reason, and says so."""

    model_config = ConfigDict(extra="forbid")

    reason: str = Field(min_length=3, max_length=1000)
