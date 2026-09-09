"""Response contracts for the progress module."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel


class TrajectoryPoint(BaseModel):
    """One piece of evidence in a competency's history."""

    date: datetime | None = None
    score: float | None = None
    label: str


class CompetencyProgress(BaseModel):
    """A learner's standing on one competency, with how it got there."""

    competency_id: UUID
    competency_code: str | None = None
    competency_name: str | None = None
    diagnostic_score: float | None = None
    current_score: float | None = None
    growth: float | None = None
    mastery_band: str | None = None
    attempt_count: int = 0
    unsuccessful_attempts: int = 0
    trajectory: list[TrajectoryPoint] = []


class RecentActivity(BaseModel):
    """Something the learner did, most recent first."""

    date: datetime | None = None
    label: str
    score: float | None = None
    resource_id: UUID | None = None
    title: str | None = None


class LearnerProgress(BaseModel):
    """The learner dashboard and drill-down, from one set of records."""

    student_id: UUID
    overall_mastery: float | None = None
    diagnostic_score: float | None = None
    growth: float | None = None
    modules_completed_count: int = 0
    total_modules_count: int = 0
    active_intervention_count: int = 0
    monitoring_status: str | None = None
    recommended_next_action: dict[str, Any] | None = None
    competencies: list[CompetencyProgress] = []
    recent_activity: list[RecentActivity] = []
