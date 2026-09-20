"""Request contracts for Teacher/Administrator administration.

Every model forbids extra fields, so a request that tries to set an identifier,
a version, or somebody's role is rejected rather than silently ignored. None of
them has a field for an actor: who did it comes from the verified token.
"""

from __future__ import annotations

import re
from enum import StrEnum
from typing import Annotated, Any
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

from modules.shared.rules import (
    validate_activity_pass_percentage,
    validate_intervention_trigger,
)

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
ACCEPTED_SETTING_KEYS = frozenset({
    "thresholds.activity_pass_percentage",
    "intervention.unsuccessful_attempts",
    "features.groq_advisory",
    "features.groq_enabled",
    "features.groq_feedback_enabled",
})


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


class AssessmentType(StrEnum):
    """The app.assessment_type enum, stated here so a wrong type is a 422.

    A free-text type reached Postgres as an invalid enum input and surfaced as a
    server error, which told the author nothing about the choices available.
    """

    DIAGNOSTIC = "diagnostic"
    REASSESSMENT = "reassessment"
    UNIT_QUIZ = "unit_quiz"


class QuestionType(StrEnum):
    """The app.question_type enum, for the same reason `AssessmentType` exists.

    A free-text type reached Postgres as an invalid enum input, which asyncpg
    raises as a `DataError` rather than an integrity violation — so it escaped
    every handler in `middleware.errors` and came back as a 500 that told the
    author nothing. Naming the vocabulary here makes it a 422 that lists the
    choices.

    All six values are accepted for authoring because the column accepts them;
    only the three in `PUBLISHABLE_QUESTION_TYPES` may be published.
    """

    MULTIPLE_CHOICE = "multiple_choice"
    NUMBER_INPUT = "number_input"
    FILL_BLANK = "fill_blank"
    TRUE_FALSE = "true_false"
    MATCHING = "matching"
    ORDERING = "ordering"


class QuestionDifficulty(StrEnum):
    """The app.question_difficulty enum. Same reasoning as `QuestionType`."""

    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"


#: The shape a competency code has to take, stated here as well as in the
#: database. The CHECK constraint is the boundary; this is what lets the API
#: say "a code looks like MATH6-NS-01" instead of letting Postgres answer with
#: a constraint name nobody outside the schema can read.
COMPETENCY_CODE_PATTERN = r"^[A-Z0-9][A-Z0-9._-]{2,63}$"

COMPETENCY_CODE_HELP = (
    "A code is upper case and starts with a letter or digit, then letters, "
    "digits, dots, underscores or hyphens — for example MATH6-NS-01."
)


def _normalised_code(value: str | None) -> str | None:
    """Upper-cased and trimmed, the way the column stores it.

    `app.competencies` carries `check (code = upper(btrim(code)))`, so a code
    that merely differs in case is not a different code — it is the same one
    spelled carelessly, and normalising here means a teacher who types
    `math6-ns-01` gets the competency they meant rather than a constraint
    error about records that do not exist.
    """
    if value is None:
        return None
    return value.strip().upper()


#: Trimmed, and refused when nothing is left. The column checks
#: `btrim(name) <> ''`; without this a name of spaces passes the API and dies
#: in the database as an unattributable constraint violation.
NonBlank = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2)]


class CompetencyDraft(BaseModel):
    """A new competency.

    No `grade_id`. MathSmart teaches one grade and the server resolves it, so
    a request cannot place a competency outside the curriculum that has
    questions, modules and assessments behind it.
    """

    model_config = ConfigDict(extra="forbid")

    code: Annotated[str, StringConstraints(min_length=3, max_length=64)]
    name: Annotated[NonBlank, StringConstraints(max_length=MAX_TITLE)]
    domain: Annotated[NonBlank, StringConstraints(max_length=120)]
    description: str | None = Field(default=None, max_length=MAX_TEXT)
    prerequisite_ids: list[UUID] = Field(default_factory=list)
    status: PublicationStatus = PublicationStatus.DRAFT

    @field_validator("code", mode="before")
    @classmethod
    def normalise_code(cls, value: Any) -> Any:
        return _normalised_code(value) if isinstance(value, str) else value

    @field_validator("code")
    @classmethod
    def code_is_well_formed(cls, value: str) -> str:
        if not re.fullmatch(COMPETENCY_CODE_PATTERN, value):
            raise ValueError(COMPETENCY_CODE_HELP)
        return value


class CompetencyChanges(BaseModel):
    """What may be changed about a competency.

    Publishing, unpublishing and restoring an archived competency are all a
    `status` here. The grade is absent for the same reason it is absent from
    the draft: a competency cannot be moved out of the grade MathSmart teaches.
    """

    model_config = ConfigDict(extra="forbid")

    code: Annotated[str, StringConstraints(min_length=3, max_length=64)] | None = None
    name: Annotated[NonBlank, StringConstraints(max_length=MAX_TITLE)] | None = None
    domain: Annotated[NonBlank, StringConstraints(max_length=120)] | None = None
    description: str | None = Field(default=None, max_length=MAX_TEXT)
    prerequisite_ids: list[UUID] | None = None
    status: PublicationStatus | None = None

    @field_validator("code", mode="before")
    @classmethod
    def normalise_code(cls, value: Any) -> Any:
        return _normalised_code(value) if isinstance(value, str) else value

    @field_validator("code")
    @classmethod
    def code_is_well_formed(cls, value: str | None) -> str | None:
        if value is not None and not re.fullmatch(COMPETENCY_CODE_PATTERN, value):
            raise ValueError(COMPETENCY_CODE_HELP)
        return value


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
    question_type: QuestionType
    difficulty: QuestionDifficulty = QuestionDifficulty.MEDIUM
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
    question_type: QuestionType | None = None
    difficulty: QuestionDifficulty | None = None
    prompt: str | None = Field(default=None, min_length=2, max_length=MAX_TEXT)
    choices: list[Any] | None = None
    answer_key: Any = None
    explanation: str | None = Field(default=None, max_length=MAX_TEXT)
    hint: str | None = Field(default=None, max_length=1000)
    visual_aid_description: str | None = Field(default=None, max_length=1000)
    status: PublicationStatus | None = None

    @model_validator(mode="after")
    def only_supported_types_may_be_published(self) -> QuestionChanges:
        """The same rule as `QuestionDraft`, for the change that names both.

        A request that publishes without naming a type is left to the database
        constraint, which reads the stored type this model cannot see.
        """
        if (
            self.status is PublicationStatus.PUBLISHED
            and self.question_type is not None
            and self.question_type not in PUBLISHABLE_QUESTION_TYPES
        ):
            raise ValueError(
                "Only multiple_choice, number_input and fill_blank questions may be published"
            )
        return self


class AssessmentDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")

    grade_id: UUID
    title: str = Field(min_length=2, max_length=MAX_TITLE)
    assessment_type: AssessmentType
    duration_minutes: int = Field(ge=1, le=480)
    description: str | None = Field(default=None, max_length=MAX_TEXT)
    status: PublicationStatus = PublicationStatus.DRAFT


class AssessmentChanges(BaseModel):
    model_config = ConfigDict(extra="forbid")

    grade_id: UUID | None = None
    title: str | None = Field(default=None, min_length=2, max_length=MAX_TITLE)
    assessment_type: AssessmentType | None = None
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
    """A new class section.

    There is deliberately no `grade_id`. MathSmart teaches one grade, so the
    server resolves it; `extra="forbid"` then means a client that sends one is
    refused rather than quietly obeyed, which is what stops a section being
    created under a grade the product does not teach.
    """

    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=60)
    adviser_id: UUID | None = None
    is_active: bool = True


class SectionChanges(BaseModel):
    """What may be changed about a section.

    No `grade_id` for the same reason: a section cannot be moved to another
    grade, because there is no other grade to move it to.
    """

    model_config = ConfigDict(extra="forbid")

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
    def validate_settings(self) -> SettingsChanges:
        for key, value in self.settings.items():
            if key not in ACCEPTED_SETTING_KEYS:
                raise ValueError(
                    f"Setting key '{key}' is not allowed. Must be one of: "
                    + ", ".join(sorted(ACCEPTED_SETTING_KEYS))
                )
            namespace = key.split(".", 1)[0]
            if namespace not in SETTING_NAMESPACES:
                raise ValueError(
                    "A setting key must be in one of: " + ", ".join(SETTING_NAMESPACES)
                )
            if key == "thresholds.activity_pass_percentage":
                if not isinstance(value, int) or isinstance(value, bool):
                    raise ValueError("thresholds.activity_pass_percentage must be an integer")
                validate_activity_pass_percentage(value)
            elif key == "intervention.unsuccessful_attempts":
                if not isinstance(value, int) or isinstance(value, bool):
                    raise ValueError("intervention.unsuccessful_attempts must be an integer")
                validate_intervention_trigger(value)
            elif key in (
                "features.groq_advisory",
                "features.groq_enabled",
                "features.groq_feedback_enabled",
            ):
                if not isinstance(value, bool):
                    raise ValueError(f"{key} must be a boolean")
        return self



class DiagnosticResetRequest(BaseModel):
    """Voiding a learner's diagnostic needs a reason, and says so."""

    model_config = ConfigDict(extra="forbid")

    reason: str = Field(min_length=3, max_length=1000)
