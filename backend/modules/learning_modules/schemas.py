"""Request and response contracts for the learning modules module."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

MAX_SECTION_IDS = 200
MAX_SECTION_ID_LENGTH = 120


class ModuleProgress(BaseModel):
    """A learner's standing in one module."""

    completion_percentage: int = 0
    is_complete: bool = False
    completed_section_ids: list[str] = []
    last_section_id: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None


class ModuleSummary(BaseModel):
    """A module as the catalogue presents it."""

    id: UUID
    competency_id: UUID
    competency_name: str | None = None
    grade_id: UUID | None = None
    title: str
    estimated_minutes: int
    status: str
    order_index: int
    path_status: str | None = None
    completion_percentage: int = 0
    is_complete: bool = False


class ActivitySummary(BaseModel):
    """An activity as a module's detail presents it."""

    id: UUID
    title: str
    status: str


class ModuleDetail(ModuleSummary):
    """The structured module the learner workflow reads."""

    learning_objective: str
    short_explanation: str
    rules: list[Any] = []
    worked_examples: list[Any] = []
    associated_activities: list[ActivitySummary] = []
    section_ids: list[str] = []
    progress: ModuleProgress | None = None


class SaveModuleProgressRequest(BaseModel):
    """Autosave for section progress.

    There is deliberately no learner field. Whose progress this is comes from
    the verified token, and `extra="forbid"` means a request that tries to name
    somebody else is rejected rather than quietly ignored.
    """

    model_config = ConfigDict(extra="forbid")

    completed_section_ids: list[str] = Field(default_factory=list, max_length=MAX_SECTION_IDS)
    last_section_id: str | None = Field(default=None, max_length=MAX_SECTION_ID_LENGTH)
