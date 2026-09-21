"""Teacher/Administrator Reports & Analytics: the filtered overview and its summary.

The overview is deterministic from end to end. Every count, average, band,
growth figure and intervention figure is the database's, for one cohort named
once in `report_repository`, and an average drawn from fewer than five
learners is withheld rather than shown.

The summary is the one optional advisory step. A teacher asks for it; the
server builds its evidence from the same overview (aggregates and question
text only, never a learner), asks Groq through the shared advisory boundary,
and accepts back only a short, checked summary. It cannot change a figure,
and with Groq switched off or failing the report is exactly as useful.
"""

from __future__ import annotations

import json
import logging
from datetime import date, datetime, time, timedelta, timezone
from typing import Annotated, Any, Literal
from uuid import UUID

from fastapi import APIRouter, Query, Request
from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.dependencies import ActorDb, CurrentActor, TeacherAdmin
from middleware.errors import ApiError
from modules.ai import class_summary
from modules.ai.service import UNAVAILABLE, UNAVAILABLE_MESSAGE, request_advice
from modules.teacher_admin import report_repository as repository
from modules.teacher_admin import service

router = APIRouter(tags=["teacher-admin"])
logger = logging.getLogger(__name__)

#: The school day. A report "from 1 September" means from midnight in the
#: Philippines, not in UTC.
SCHOOL_TIME = timezone(timedelta(hours=8))

MonitoringStatus = Literal["active", "needs_intervention", "improving", "mastered", "inactive"]

WATCH_PAGE_SIZE = 10
MAX_WATCH_PAGE_SIZE = 50
MOST_MISSED_LIMIT = 5
MAX_RANGE_DAYS = 366


def _number(value: Any) -> float | None:
    return None if value is None else float(value)


def _count(value: Any) -> int:
    return int(value or 0)


def _average(value: Any, learners: Any) -> float | None:
    return None if service.suppressed(learners) else _number(value)


def report_filters(
    section_id: UUID | None,
    competency_id: UUID | None,
    status: str | None,
    start: date | None,
    end: date | None,
) -> dict[str, Any]:
    """The cohort and range, checked once for every route that takes them."""
    if start and end and end < start:
        raise ApiError(
            422,
            "The end date is before the start date.",
            code="validation_error",
            fields={"to": ["Choose an end date on or after the start date."]},
        )
    if start and end and (end - start).days > MAX_RANGE_DAYS:
        raise ApiError(
            422,
            "Choose a date range of one year or less.",
            code="validation_error",
            fields={"to": ["Choose a date range of one year or less."]},
        )
    return {
        "section_id": section_id,
        "competency_id": competency_id,
        "status": status,
        "from": start,
        "to": end,
        "start": datetime.combine(start, time.min, SCHOOL_TIME) if start else None,
        # Exclusive, so "to 30 September" includes everything on the 30th.
        "until": (
            datetime.combine(end + timedelta(days=1), time.min, SCHOOL_TIME) if end else None
        ),
    }


def _choice_text(choices: Any, answer: Any) -> str | None:
    """The wording of a submitted answer: a choice's label, or the value itself."""
    if isinstance(answer, str):
        try:
            answer = json.loads(answer)
        except (json.JSONDecodeError, TypeError):
            pass
    if isinstance(choices, str):
        try:
            choices = json.loads(choices)
        except (json.JSONDecodeError, TypeError):
            choices = None
    if isinstance(choices, list):
        for choice in choices:
            if isinstance(choice, dict) and choice.get("key") == answer:
                label = choice.get("label") or choice.get("text")
                return str(label) if label is not None else None
    if isinstance(answer, (str, int, float)) and not isinstance(answer, bool):
        return str(answer)
    return None


async def build_overview(
    connection: Any, filters: dict[str, Any], *, page: int, page_size: int
) -> dict[str, Any]:
    summary = await repository.summary(connection, filters)
    section_rows = await repository.sections(connection, filters)
    competency_rows = await repository.competencies(connection, filters)
    activity = await repository.activity(connection, filters)
    missed_rows = await repository.most_missed(
        connection,
        filters,
        min_learners=service.MIN_COHORT_FOR_AVERAGE,
        limit=MOST_MISSED_LIMIT,
    )
    cases = await repository.interventions(connection, filters)
    watch_rows = await repository.watch_list(
        connection, filters, limit=page_size, offset=(page - 1) * page_size
    )

    with_scores = summary["learners_with_scores"]
    with_growth = summary["learners_with_growth"]
    activity_learners = activity["activity_learners"]
    activity_attempts = _count(activity["activity_attempts"])

    return {
        "filters": {
            "section_id": str(filters["section_id"]) if filters["section_id"] else None,
            "competency_id": (
                str(filters["competency_id"]) if filters["competency_id"] else None
            ),
            "status": filters["status"],
            "from": filters["from"].isoformat() if filters["from"] else None,
            "to": filters["to"].isoformat() if filters["to"] else None,
        },
        "privacy": {"minimum_learners_for_average": service.MIN_COHORT_FOR_AVERAGE},
        "summary": {
            "learner_count": _count(summary["learner_count"]),
            "needs_support_count": _count(summary["needs_support_count"]),
            "improving_count": _count(summary["improving_count"]),
            "mastered_count": _count(summary["mastered_count"]),
            "published_competency_count": _count(summary["published_competency_count"]),
            "diagnostic": {
                "not_started": _count(summary["diagnostic_not_started"]),
                "in_progress": _count(summary["diagnostic_in_progress"]),
                "completed": _count(summary["diagnostic_completed"]),
            },
            "learners_with_scores": _count(with_scores),
            "average_current": _average(summary["average_current"], with_scores),
            "average_diagnostic": _average(summary["average_diagnostic"], with_scores),
            "average_growth": _average(summary["average_growth"], with_growth),
            "averages_suppressed": service.suppressed(with_scores),
        },
        "sections": [
            {
                "section_id": str(row["section_id"]),
                "name": row["section_name"],
                "learner_count": _count(row["learner_count"]),
                "needs_support_count": _count(row["needs_support_count"]),
                "mastered_count": _count(row["mastered_count"]),
                "diagnostic_completed": _count(row["diagnostic_completed"]),
                "average_current": _average(row["average_current"], row["learners_with_scores"]),
                "average_diagnostic": _average(
                    row["average_diagnostic"], row["learners_with_scores"]
                ),
                "suppressed": service.suppressed(row["learners_with_scores"]),
            }
            for row in section_rows
        ],
        "competencies": [
            {
                "competency_id": str(row["competency_id"]),
                "code": row["code"],
                "name": row["name"],
                "learners_tracked": _count(row["learners_tracked"]),
                "mastered_count": _count(row["mastered_count"]),
                "developing_count": _count(row["developing_count"]),
                "needs_improvement_count": _count(row["needs_improvement_count"]),
                "average_current": _average(row["average_current"], row["learners_tracked"]),
                "average_diagnostic": _average(
                    row["average_diagnostic"], row["learners_tracked"]
                ),
                "growth": (
                    None
                    if service.suppressed(row["learners_tracked"])
                    else service.growth(row["average_current"], row["average_diagnostic"])
                ),
                "average_band": (
                    None
                    if service.suppressed(row["learners_tracked"]) or not row["average_band"]
                    else str(row["average_band"])
                ),
                "suppressed": service.suppressed(row["learners_tracked"]),
            }
            for row in competency_rows
        ],
        "activity": {
            "assessments_scored": _count(activity["assessments_scored"]),
            "assessment_learners": _count(activity["assessment_learners"]),
            "assessment_average": _average(
                activity["assessment_average"], activity["assessment_learners"]
            ),
            "activity_attempts": activity_attempts,
            "activity_learners": _count(activity_learners),
            "activity_passed": _count(activity["activity_passed"]),
            "activity_average": _average(activity["activity_average"], activity_learners),
            "modules_completed": _count(activity["modules_completed"]),
        },
        "most_missed": [
            {
                "question_id": str(row["question_id"]),
                "competency_code": row["competency_code"],
                "competency_name": row["competency_name"],
                "prompt": row["prompt"],
                "learners_answered": _count(row["learners_answered"]),
                "answered": _count(row["answered"]),
                "incorrect": _count(row["incorrect"]),
                # A wrong answer given once says something about one child.
                "common_wrong_answer": (
                    _choice_text(row["choices"], row["common_wrong_answer"])
                    if _count(row["common_wrong_times"]) >= 2
                    else None
                ),
                "common_wrong_count": (
                    _count(row["common_wrong_times"])
                    if _count(row["common_wrong_times"]) >= 2
                    else None
                ),
            }
            for row in missed_rows
        ],
        "interventions": {
            "needs_intervention": _count(cases["needs_intervention"]),
            "in_progress": _count(cases["in_progress"]),
            "resolved": _count(cases["resolved"]),
            "opened_in_range": _count(cases["opened_in_range"]),
            "resolved_in_range": _count(cases["resolved_in_range"]),
            "median_days_to_resolve": _number(cases["median_days_to_resolve"]),
        },
        "watch_list": {
            "rows": [
                {
                    "student_id": str(row["student_id"]),
                    "learner_id": row["learner_id"],
                    "full_name": row["full_name"],
                    "section_name": row["section_name"],
                    "monitoring_status": str(row["monitoring_status"]),
                    "diagnostic_average": _number(row["diagnostic_average"]),
                    "current_average": _number(row["current_average"]),
                    "open_intervention_count": _count(row["open_intervention_count"]),
                }
                for row in watch_rows
            ],
            "total": _count(watch_rows[0]["total"]) if watch_rows else 0,
            "page": page,
            "page_size": page_size,
        },
    }


@router.get("/teacher-admin/reports/overview")
async def read_report_overview(
    _actor: TeacherAdmin,
    connection: ActorDb,
    section_id: Annotated[UUID | None, Query()] = None,
    competency_id: Annotated[UUID | None, Query()] = None,
    status: Annotated[MonitoringStatus | None, Query()] = None,
    start: Annotated[date | None, Query(alias="from")] = None,
    end: Annotated[date | None, Query(alias="to")] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=MAX_WATCH_PAGE_SIZE)] = WATCH_PAGE_SIZE,
) -> dict[str, Any]:
    """The whole filtered report in one reply, so every figure shares one cohort."""
    filters = report_filters(section_id, competency_id, status, start, end)
    return {"data": await build_overview(connection, filters, page=page, page_size=page_size)}


class ReportSummaryRequest(BaseModel):
    """The report to explain, named by its filters and nothing else.

    There is no field for figures: the server reads them itself, so a request
    cannot hand Groq numbers the database never produced.
    """

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    section_id: UUID | None = None
    competency_id: UUID | None = None
    status: MonitoringStatus | None = None
    start: date | None = Field(default=None, alias="from")
    end: date | None = Field(default=None, alias="to")

    @model_validator(mode="after")
    def check_range(self) -> ReportSummaryRequest:
        if self.start and self.end and self.end < self.start:
            raise ValueError("The end date is before the start date.")
        return self


class ClassReportEvidence(BaseModel):
    """What Groq is shown: aggregates and question text, and no learner.

    Field names avoid the fragments the adapter redacts (a competency's name is
    its `title` here), so curriculum words reach the prompt and identities
    never do.
    """

    scope: str
    learners: int
    diagnostic_completed: int
    average_current_score: float | None = None
    average_diagnostic_score: float | None = None
    average_growth: float | None = None
    competencies: list[dict[str, Any]] = Field(default_factory=list)
    most_missed: list[dict[str, Any]] = Field(default_factory=list)
    interventions: dict[str, Any] = Field(default_factory=dict)


def evidence_from_overview(overview: dict[str, Any]) -> ClassReportEvidence:
    summary = overview["summary"]
    filters = overview["filters"]
    scope = ["Grade 6 mathematics"]
    if filters["section_id"]:
        scope.append("one section")
    if filters["status"]:
        scope.append(f"learners with status {filters['status'].replace('_', ' ')}")
    if filters["from"] or filters["to"]:
        start, end = filters["from"] or "the start", filters["to"] or "today"
        scope.append(f"activity from {start} to {end}")

    return ClassReportEvidence(
        scope=", ".join(scope),
        learners=summary["learner_count"],
        diagnostic_completed=summary["diagnostic"]["completed"],
        average_current_score=summary["average_current"],
        average_diagnostic_score=summary["average_diagnostic"],
        average_growth=summary["average_growth"],
        competencies=[
            {
                "code": row["code"],
                "title": row["name"],
                "learners_tracked": row["learners_tracked"],
                "mastered": row["mastered_count"],
                "developing": row["developing_count"],
                "needs_improvement": row["needs_improvement_count"],
                "average_current_score": row["average_current"],
                "average_diagnostic_score": row["average_diagnostic"],
            }
            for row in overview["competencies"][:5]
            if row["learners_tracked"] > 0
        ],
        most_missed=[
            {
                "competency_code": row["competency_code"],
                "question_text": row["prompt"],
                "answered": row["answered"],
                "incorrect": row["incorrect"],
                "common_wrong_answer": row["common_wrong_answer"],
                "common_wrong_count": row["common_wrong_count"],
            }
            for row in overview["most_missed"]
        ],
        interventions={
            "open": overview["interventions"]["needs_intervention"],
            "in_progress": overview["interventions"]["in_progress"],
            "resolved": overview["interventions"]["resolved"],
        },
    )


@router.post("/teacher-admin/reports/summary")
async def summarise_report(
    _actor: TeacherAdmin,
    actor: CurrentActor,
    connection: ActorDb,
    request: Request,
    body: ReportSummaryRequest,
) -> dict[str, Any]:
    """An optional, advisory explanation of the report the teacher is looking at.

    Asked for by the teacher, never on page load. The reply carries the summary
    and nothing about how it was made; the provider and model are logged here,
    on the server, and not returned.
    """
    filters = report_filters(body.section_id, body.competency_id, body.status, body.start, body.end)
    overview = await build_overview(connection, filters, page=1, page_size=1)
    evidence = evidence_from_overview(overview)

    if evidence.learners == 0:
        raise ApiError(
            422,
            "There is nothing in this report to summarise yet.",
            code="nothing_to_summarise",
        )

    result = await request_advice(
        request,
        purpose="class report summary",
        model=evidence,
        actor=actor,
        instructions=class_summary.INSTRUCTIONS,
        max_tokens=class_summary.MAX_TOKENS,
    )
    parsed = class_summary.parse_class_summary(
        result.text, evidence.model_dump(mode="json", exclude_none=True)
    )
    if parsed is None:
        raise ApiError(503, UNAVAILABLE_MESSAGE, code=UNAVAILABLE)

    logger.info(
        "class report summary provider=%s model=%s words=%d",
        result.provider,
        result.model,
        parsed.word_count(),
    )
    return {
        "data": {
            "overview": parsed.overview,
            "patterns": parsed.patterns,
            "actions": parsed.actions,
        }
    }
