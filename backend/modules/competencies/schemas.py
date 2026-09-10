"""Request and response contracts for the competencies module."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel


class PublicationStatus(StrEnum):
    """Mirrors `app.publication_status`.

    Declared so an unknown value is refused at the edge with a 422 rather than
    reaching PostgreSQL as an invalid enum label.
    """

    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"


class CompetencySummary(BaseModel):
    """A competency as the list presents it."""

    id: UUID
    code: str
    grade_id: UUID
    domain: str
    name: str
    description: str | None = None
    status: str
    prerequisite_ids: list[str] = []


class ModuleSummary(BaseModel):
    """A module as a competency's detail presents it."""

    id: UUID
    title: str
    estimated_minutes: int
    status: str
    order_index: int


class CompetencyProgress(BaseModel):
    """The caller's own standing on one competency."""

    diagnostic_score: float | None = None
    current_score: float | None = None
    mastery_band: str | None = None
    attempt_count: int = 0
    last_studied_at: datetime | None = None


class CompetencyDetail(CompetencySummary):
    """A competency with its modules, and the caller's progress when there is one."""

    modules: list[ModuleSummary] = []
    progress: CompetencyProgress | None = None
