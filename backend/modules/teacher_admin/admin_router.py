"""Teacher/Administrator administration routes.

Curriculum authoring writes through the actor connection, because the column
grants and the policies already say what may be authored and by whom. The two
things `authenticated` cannot write — an account's status and a voided attempt —
go through audited functions instead.

Every mutation here is a security-critical teacher-admin action, so every one of
them requires a live session as well as the role.
"""

from __future__ import annotations

import json
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Query, Response

from app.dependencies import ActorDb, CurrentActor, SensitiveActor, TeacherAdmin
from middleware.errors import ApiError
from middleware.request_context import current_request_id
from modules.shared.rules import DEFAULT_ACTIVITY_PASS_PERCENTAGE, DEFAULT_INTERVENTION_TRIGGER
from modules.teacher_admin import admin_repository as repository
from modules.teacher_admin.admin_repository import (
    ACTIVITIES,
    ASSESSMENTS,
    COMPETENCIES,
    GRADES,
    LEARNING_MODULES,
    QUESTIONS,
    SECTIONS,
    Resource,
)
from modules.teacher_admin.admin_schemas import (
    AccountStatus,
    ActivityChanges,
    ActivityDraft,
    AssessmentChanges,
    AssessmentDraft,
    AssessmentQuestions,
    CompetencyChanges,
    CompetencyDraft,
    DiagnosticResetRequest,
    GradeChanges,
    GradeDraft,
    ModuleChanges,
    ModuleDraft,
    PublicationStatus,
    QuestionChanges,
    QuestionDraft,
    SectionChanges,
    SectionDraft,
    SettingsChanges,
    UserChanges,
    UserRole,
)

router = APIRouter(tags=["teacher-admin"])

MAX_PAGE_SIZE = 200
DEFAULT_PAGE_SIZE = 50
MAX_SEARCH_LENGTH = 120

#: Settings the API reports even when nothing has been stored, so the effective
#: configuration is always complete.
SETTING_DEFAULTS = {
    "thresholds.activity_pass_percentage": DEFAULT_ACTIVITY_PASS_PERCENTAGE,
    "intervention.unsuccessful_attempts": DEFAULT_INTERVENTION_TRIGGER,
}

#: jsonb columns, which asyncpg hands over as text and expects back as text.
JSON_COLUMNS = {"prerequisite_ids", "rules", "worked_examples", "choices", "answer_key"}


def _row(row: Any, resource: Resource) -> dict[str, Any]:
    """A response row, in the resource's own readable columns and nothing else."""
    payload: dict[str, Any] = {}
    for column in resource.readable:
        value = row[column]
        if column in JSON_COLUMNS and isinstance(value, str):
            value = json.loads(value)
        payload[column] = str(value) if isinstance(value, UUID) else value
    return payload


def _values(model: Any) -> dict[str, Any]:
    """Only the fields the request actually set, JSON columns re-encoded."""
    supplied = model.model_dump(mode="json", exclude_unset=True)
    return {
        key: json.dumps(value) if key in JSON_COLUMNS else value
        for key, value in supplied.items()
    }


def _envelope(rows: list[Any], resource: Resource, total: int, page: int, size: int) -> dict:
    return {
        "data": [_row(row, resource) for row in rows],
        "meta": {
            "page": page,
            "page_size": size,
            "total_items": total,
            "total_pages": (total + size - 1) // size if size else 0,
        },
    }


async def _list(
    connection: Any,
    resource: Resource,
    search: str | None,
    page: int,
    size: int,
    status: str | None = None,
) -> dict[str, Any]:
    offset = (page - 1) * size
    rows = await repository.listing(
        connection, resource, search=search, limit=size, offset=offset, status=status
    )
    total = await repository.listing_total(connection, resource, search=search, status=status)
    return _envelope(list(rows), resource, total, page, size)


async def _read(connection: Any, resource: Resource, key: UUID) -> dict[str, Any]:
    row = await repository.read(connection, resource, key)
    if row is None:
        raise ApiError(404, "No record was found")
    return {"data": _row(row, resource)}


async def _create(connection: Any, resource: Resource, model: Any) -> dict[str, Any]:
    row = await repository.create(connection, resource, _values(model))
    if row is None:
        raise ApiError(422, "The record could not be created", code="not_created")
    return {"data": _row(row, resource)}


async def _update(connection: Any, resource: Resource, key: UUID, model: Any) -> dict[str, Any]:
    row = await repository.update(connection, resource, key, _values(model))
    if row is None:
        raise ApiError(404, "No record was found")
    return {"data": _row(row, resource)}


async def _archive(connection: Any, resource: Resource, key: UUID) -> Response:
    archived = await repository.archive(connection, resource, key)
    if archived is None:
        raise ApiError(404, "No record was found")
    return Response(status_code=204)


# ---------------------------------------------------------------------------
# Competencies
# ---------------------------------------------------------------------------


@router.get("/teacher-admin/competencies")
async def list_competencies(
    _actor: TeacherAdmin,
    connection: ActorDb,
    search: Annotated[str | None, Query(max_length=MAX_SEARCH_LENGTH)] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = DEFAULT_PAGE_SIZE,
) -> dict[str, Any]:
    """Competency drafts and published competencies alike."""
    return await _list(connection, COMPETENCIES, search, page, page_size)


@router.post("/teacher-admin/competencies", status_code=201)
async def create_competency(
    _actor: TeacherAdmin, _session: SensitiveActor, connection: ActorDb, body: CompetencyDraft
) -> dict[str, Any]:
    """Create a competency draft."""
    return await _create(connection, COMPETENCIES, body)


@router.get("/teacher-admin/competencies/{competency_id}")
async def read_competency(
    _actor: TeacherAdmin, connection: ActorDb, competency_id: UUID
) -> dict[str, Any]:
    return await _read(connection, COMPETENCIES, competency_id)


@router.patch("/teacher-admin/competencies/{competency_id}")
async def update_competency(
    _actor: TeacherAdmin,
    _session: SensitiveActor,
    connection: ActorDb,
    competency_id: UUID,
    body: CompetencyChanges,
) -> dict[str, Any]:
    return await _update(connection, COMPETENCIES, competency_id, body)


@router.delete("/teacher-admin/competencies/{competency_id}", status_code=204)
async def archive_competency(
    _actor: TeacherAdmin, _session: SensitiveActor, connection: ActorDb, competency_id: UUID
) -> Response:
    """Archive, never delete: learner history points at this row."""
    return await _archive(connection, COMPETENCIES, competency_id)


# ---------------------------------------------------------------------------
# Learning modules
# ---------------------------------------------------------------------------


@router.get("/teacher-admin/modules")
async def list_modules(
    _actor: TeacherAdmin,
    connection: ActorDb,
    search: Annotated[str | None, Query(max_length=MAX_SEARCH_LENGTH)] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = DEFAULT_PAGE_SIZE,
) -> dict[str, Any]:
    return await _list(connection, LEARNING_MODULES, search, page, page_size)


@router.post("/teacher-admin/modules", status_code=201)
async def create_module(
    _actor: TeacherAdmin, _session: SensitiveActor, connection: ActorDb, body: ModuleDraft
) -> dict[str, Any]:
    return await _create(connection, LEARNING_MODULES, body)


@router.get("/teacher-admin/modules/{module_id}")
async def read_module(
    _actor: TeacherAdmin, connection: ActorDb, module_id: UUID
) -> dict[str, Any]:
    return await _read(connection, LEARNING_MODULES, module_id)


@router.patch("/teacher-admin/modules/{module_id}")
async def update_module(
    _actor: TeacherAdmin,
    _session: SensitiveActor,
    connection: ActorDb,
    module_id: UUID,
    body: ModuleChanges,
) -> dict[str, Any]:
    return await _update(connection, LEARNING_MODULES, module_id, body)


@router.delete("/teacher-admin/modules/{module_id}", status_code=204)
async def archive_module(
    _actor: TeacherAdmin, _session: SensitiveActor, connection: ActorDb, module_id: UUID
) -> Response:
    return await _archive(connection, LEARNING_MODULES, module_id)


# ---------------------------------------------------------------------------
# Activities
# ---------------------------------------------------------------------------


@router.get("/teacher-admin/activities")
async def list_activities(
    _actor: TeacherAdmin,
    connection: ActorDb,
    search: Annotated[str | None, Query(max_length=MAX_SEARCH_LENGTH)] = None,
    status: PublicationStatus | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = DEFAULT_PAGE_SIZE,
) -> dict[str, Any]:
    return await _list(
        connection, ACTIVITIES, search, page, page_size, status.value if status else None
    )


@router.post("/teacher-admin/activities", status_code=201)
async def create_activity(
    _actor: TeacherAdmin, _session: SensitiveActor, connection: ActorDb, body: ActivityDraft
) -> dict[str, Any]:
    return await _create(connection, ACTIVITIES, body)


@router.get("/teacher-admin/activities/{activity_id}")
async def read_activity_draft(
    _actor: TeacherAdmin, connection: ActorDb, activity_id: UUID
) -> dict[str, Any]:
    return await _read(connection, ACTIVITIES, activity_id)


@router.patch("/teacher-admin/activities/{activity_id}")
async def update_activity(
    _actor: TeacherAdmin,
    _session: SensitiveActor,
    connection: ActorDb,
    activity_id: UUID,
    body: ActivityChanges,
) -> dict[str, Any]:
    return await _update(connection, ACTIVITIES, activity_id, body)


@router.delete("/teacher-admin/activities/{activity_id}", status_code=204)
async def archive_activity(
    _actor: TeacherAdmin, _session: SensitiveActor, connection: ActorDb, activity_id: UUID
) -> Response:
    return await _archive(connection, ACTIVITIES, activity_id)


# ---------------------------------------------------------------------------
# The question bank
# ---------------------------------------------------------------------------


@router.get("/teacher-admin/questions")
async def list_questions(
    _actor: TeacherAdmin,
    connection: ActorDb,
    search: Annotated[str | None, Query(max_length=MAX_SEARCH_LENGTH)] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = DEFAULT_PAGE_SIZE,
) -> dict[str, Any]:
    """The question bank. No response here carries an answer key."""
    return await _list(connection, QUESTIONS, search, page, page_size)


@router.post("/teacher-admin/questions", status_code=201)
async def create_question(
    _actor: TeacherAdmin, _session: SensitiveActor, connection: ActorDb, body: QuestionDraft
) -> dict[str, Any]:
    """Author a question, answer key included. The key is written, never read back."""
    return await _create(connection, QUESTIONS, body)


@router.get("/teacher-admin/questions/{question_id}")
async def read_question(
    _actor: TeacherAdmin, connection: ActorDb, question_id: UUID
) -> dict[str, Any]:
    return await _read(connection, QUESTIONS, question_id)


@router.patch("/teacher-admin/questions/{question_id}")
async def update_question(
    _actor: TeacherAdmin,
    _session: SensitiveActor,
    connection: ActorDb,
    question_id: UUID,
    body: QuestionChanges,
) -> dict[str, Any]:
    return await _update(connection, QUESTIONS, question_id, body)


@router.delete("/teacher-admin/questions/{question_id}", status_code=204)
async def archive_question(
    _actor: TeacherAdmin, _session: SensitiveActor, connection: ActorDb, question_id: UUID
) -> Response:
    return await _archive(connection, QUESTIONS, question_id)


# ---------------------------------------------------------------------------
# Assessments
# ---------------------------------------------------------------------------


@router.get("/teacher-admin/assessments")
async def list_assessment_drafts(
    _actor: TeacherAdmin,
    connection: ActorDb,
    search: Annotated[str | None, Query(max_length=MAX_SEARCH_LENGTH)] = None,
    status: PublicationStatus | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = DEFAULT_PAGE_SIZE,
) -> dict[str, Any]:
    """Assessments, each row carrying how many questions it holds.

    The count decides whether a row can be published at all, so a listing that
    omitted it would have to disable publication everywhere or guess.
    """
    envelope = await _list(
        connection, ASSESSMENTS, search, page, page_size, status.value if status else None
    )
    counts = await repository.assessment_question_counts(
        connection, [UUID(row["assessment_id"]) for row in envelope["data"]]
    )
    for row in envelope["data"]:
        row["question_count"] = counts.get(UUID(row["assessment_id"]), 0)
    return envelope


@router.post("/teacher-admin/assessments", status_code=201)
async def create_assessment(
    _actor: TeacherAdmin, _session: SensitiveActor, connection: ActorDb, body: AssessmentDraft
) -> dict[str, Any]:
    return await _create(connection, ASSESSMENTS, body)


@router.get("/teacher-admin/assessments/{assessment_id}")
async def read_assessment_draft(
    _actor: TeacherAdmin, connection: ActorDb, assessment_id: UUID
) -> dict[str, Any]:
    """One assessment, with its membership in delivery order.

    Membership replacement is whole-list, so an editor that could not read the
    current order would erase it on its first save.
    """
    payload = await _read(connection, ASSESSMENTS, assessment_id)
    question_ids = await repository.assessment_question_ids(connection, assessment_id)
    payload["data"]["question_ids"] = [str(question_id) for question_id in question_ids]
    payload["data"]["question_count"] = len(question_ids)
    return payload


@router.patch("/teacher-admin/assessments/{assessment_id}")
async def update_assessment(
    _actor: TeacherAdmin,
    _session: SensitiveActor,
    connection: ActorDb,
    assessment_id: UUID,
    body: AssessmentChanges,
) -> dict[str, Any]:
    return await _update(connection, ASSESSMENTS, assessment_id, body)


@router.delete("/teacher-admin/assessments/{assessment_id}", status_code=204)
async def archive_assessment(
    _actor: TeacherAdmin, _session: SensitiveActor, connection: ActorDb, assessment_id: UUID
) -> Response:
    return await _archive(connection, ASSESSMENTS, assessment_id)


@router.put("/teacher-admin/assessments/{assessment_id}/questions")
async def replace_assessment_questions(
    _actor: TeacherAdmin,
    _session: SensitiveActor,
    connection: ActorDb,
    assessment_id: UUID,
    body: AssessmentQuestions,
) -> dict[str, Any]:
    """Replace the ordered membership.

    The whole list is replaced inside the request's transaction, so a partial
    membership is never visible: the position of each question is its place in
    the list that was sent.
    """
    await repository.replace_assessment_questions(
        connection, assessment_id=assessment_id, question_ids=body.question_ids
    )
    row = await repository.read(connection, ASSESSMENTS, assessment_id)
    if row is None:
        raise ApiError(404, "No assessment was found")
    return {
        "data": {
            **_row(row, ASSESSMENTS),
            "question_ids": [str(question_id) for question_id in body.question_ids],
            "question_count": len(body.question_ids),
        }
    }


@router.post("/teacher-admin/assessments/{assessment_id}/publish")
async def publish_assessment(
    _actor: TeacherAdmin, _session: SensitiveActor, connection: ActorDb, assessment_id: UUID
) -> dict[str, Any]:
    """Publish an assessment, once it is safe to deliver.

    An empty assessment would hand a learner nothing to answer and then score
    them zero. A question that is still a draft, or a grade that is no longer
    active, would reach the learner just as broken. So publication is refused
    until all three hold, and the refusal names the one that failed.
    """
    readiness = await repository.assessment_publication_readiness(connection, assessment_id)
    if readiness is None:
        raise ApiError(404, "No assessment was found")

    if readiness["question_total"] < 1:
        raise ApiError(
            422,
            "An assessment needs at least one question before it can be published",
            code="assessment_not_publishable",
        )
    if readiness["unpublished_total"] > 0:
        raise ApiError(
            422,
            "Every question in the assessment must be published first",
            code="assessment_not_publishable",
        )
    if not readiness["grade_is_active"]:
        raise ApiError(
            422,
            "The assessment's grade level is not active",
            code="assessment_not_publishable",
        )

    row = await repository.update(
        connection, ASSESSMENTS, assessment_id, {"status": "published"}
    )
    if row is None:
        raise ApiError(404, "No assessment was found")
    return {
        "data": {
            **_row(row, ASSESSMENTS),
            "question_count": readiness["question_total"],
        }
    }


# ---------------------------------------------------------------------------
# Grades and sections
# ---------------------------------------------------------------------------


@router.get("/teacher-admin/grades")
async def list_grades(
    _actor: TeacherAdmin,
    connection: ActorDb,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = DEFAULT_PAGE_SIZE,
) -> dict[str, Any]:
    return await _list(connection, GRADES, None, page, page_size)


@router.post("/teacher-admin/grades", status_code=201)
async def create_grade(
    _actor: TeacherAdmin, _session: SensitiveActor, connection: ActorDb, body: GradeDraft
) -> dict[str, Any]:
    return await _create(connection, GRADES, body)


@router.patch("/teacher-admin/grades/{grade_id}")
async def update_grade(
    _actor: TeacherAdmin,
    _session: SensitiveActor,
    connection: ActorDb,
    grade_id: UUID,
    body: GradeChanges,
) -> dict[str, Any]:
    return await _update(connection, GRADES, grade_id, body)


@router.delete("/teacher-admin/grades/{grade_id}", status_code=204)
async def deactivate_grade(
    _actor: TeacherAdmin, _session: SensitiveActor, connection: ActorDb, grade_id: UUID
) -> Response:
    """A grade has no publication status, so retiring it deactivates it."""
    deactivated = await repository.deactivate(connection, GRADES, grade_id)
    if deactivated is None:
        raise ApiError(404, "No grade was found")
    return Response(status_code=204)


@router.get("/teacher-admin/sections")
async def list_sections(
    _actor: TeacherAdmin,
    connection: ActorDb,
    search: Annotated[str | None, Query(max_length=MAX_SEARCH_LENGTH)] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = DEFAULT_PAGE_SIZE,
) -> dict[str, Any]:
    return await _list(connection, SECTIONS, search, page, page_size)


@router.post("/teacher-admin/sections", status_code=201)
async def create_section(
    _actor: TeacherAdmin, _session: SensitiveActor, connection: ActorDb, body: SectionDraft
) -> dict[str, Any]:
    return await _create(connection, SECTIONS, body)


@router.patch("/teacher-admin/sections/{section_id}")
async def update_section(
    _actor: TeacherAdmin,
    _session: SensitiveActor,
    connection: ActorDb,
    section_id: UUID,
    body: SectionChanges,
) -> dict[str, Any]:
    """Update a section, including assigning its adviser."""
    return await _update(connection, SECTIONS, section_id, body)


@router.delete("/teacher-admin/sections/{section_id}", status_code=204)
async def deactivate_section(
    _actor: TeacherAdmin, _session: SensitiveActor, connection: ActorDb, section_id: UUID
) -> Response:
    deactivated = await repository.deactivate(connection, SECTIONS, section_id)
    if deactivated is None:
        raise ApiError(404, "No section was found")
    return Response(status_code=204)


# ---------------------------------------------------------------------------
# Accounts
# ---------------------------------------------------------------------------


def _user(row: Any) -> dict[str, Any]:
    return {
        "user_id": str(row["user_id"]),
        "full_name": row["full_name"],
        "email": row["email"],
        "role": str(row["role"]),
        "account_status": str(row["account_status"]),
        "archived_at": row["archived_at"],
        "created_at": row["created_at"],
    }


@router.get("/teacher-admin/users")
async def list_users(
    _actor: TeacherAdmin,
    connection: ActorDb,
    role: Annotated[UserRole | None, Query()] = None,
    account_status: Annotated[AccountStatus | None, Query()] = None,
    search: Annotated[str | None, Query(max_length=MAX_SEARCH_LENGTH)] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = DEFAULT_PAGE_SIZE,
) -> dict[str, Any]:
    """Accounts by role, status and search."""
    offset = (page - 1) * page_size
    filters = {
        "role": role.value if role else None,
        "account_status": account_status.value if account_status else None,
        "search": search,
    }
    rows = await repository.users(connection, limit=page_size, offset=offset, **filters)
    total = await repository.users_total(connection, **filters)
    return {
        "data": [_user(row) for row in rows],
        "meta": {
            "page": page,
            "page_size": page_size,
            "total_items": total,
            "total_pages": (total + page_size - 1) // page_size if page_size else 0,
        },
    }


@router.get("/teacher-admin/users/{user_id}")
async def read_user(
    _actor: TeacherAdmin, connection: ActorDb, user_id: UUID
) -> dict[str, Any]:
    row = await repository.user(connection, user_id)
    if row is None:
        raise ApiError(404, "No account was found")
    return {"data": _user(row)}


@router.patch("/teacher-admin/users/{user_id}")
async def update_user(
    _actor: TeacherAdmin,
    _session: SensitiveActor,
    connection: ActorDb,
    user_id: UUID,
    body: UserChanges,
) -> dict[str, Any]:
    """Change an account's status.

    The status is not in the column grant for `authenticated`, so it goes
    through an audited function that also refuses to change the caller's own —
    an administrator who suspends themselves has no way back in.
    """
    if body.account_status is None:
        raise ApiError(422, "No supported change was supplied", code="validation_error")

    row = await repository.set_account_status(
        connection,
        user_id=user_id,
        status=body.account_status.value,
        request_id=current_request_id(),
    )
    if row is None:
        raise ApiError(404, "No account was found")
    return {"data": _user(row)}


@router.delete("/teacher-admin/users/{user_id}")
async def archive_user(
    _actor: TeacherAdmin, _session: SensitiveActor, connection: ActorDb, user_id: UUID
) -> dict[str, Any]:
    """Archive an account.

    Archiving is the retention-safe outcome: learner records point at this row,
    and the account-status check refuses every request from an archived profile
    on its next call. Deleting the Auth user is deliberately not done here — it
    would orphan the history and would not retract the access token either.
    """
    row = await repository.set_account_status(
        connection,
        user_id=user_id,
        status=AccountStatus.ARCHIVED.value,
        request_id=current_request_id(),
    )
    if row is None:
        raise ApiError(404, "No account was found")
    return {"data": _user(row)}


# ---------------------------------------------------------------------------
# Settings, audit and the diagnostic reset
# ---------------------------------------------------------------------------


@router.get("/teacher-admin/settings")
async def read_settings(_actor: TeacherAdmin, connection: ActorDb) -> dict[str, Any]:
    """The effective configuration.

    What is absent is the point: there is no credential here and no editable
    model. The Groq API key and the selected model are `.env` values that the
    database has no column for and this response has no field for.
    """
    stored = {
        row["setting_key"]: (
            json.loads(row["setting_value"])
            if isinstance(row["setting_value"], str)
            else row["setting_value"]
        )
        for row in await repository.settings(connection)
    }
    effective = {**SETTING_DEFAULTS, **stored}

    return {
        "data": {
            "thresholds": {
                "activity_pass_percentage": effective[
                    "thresholds.activity_pass_percentage"
                ],
            },
            "intervention": {
                "unsuccessful_attempts": effective["intervention.unsuccessful_attempts"],
            },
            "notifications": {
                key.split(".", 1)[1]: value
                for key, value in effective.items()
                if key.startswith("notifications.")
            },
            "features": {
                key.split(".", 1)[1]: value
                for key, value in effective.items()
                if key.startswith("features.")
            },
            "groq": {
                "enabled": bool(effective.get("features.groq_enabled", False)),
                "model_is_editable": False,
                "model_source": "server environment",
            },
        }
    }


@router.patch("/teacher-admin/settings")
async def update_settings(
    _actor: TeacherAdmin,
    _session: SensitiveActor,
    actor: CurrentActor,
    connection: ActorDb,
    body: SettingsChanges,
) -> dict[str, Any]:
    """Update validated configuration.

    The namespaces are checked before the write and again by the database, and
    the stored value is rejected there if it looks like a credential.
    """
    for key, value in body.settings.items():
        await repository.upsert_setting(
            connection, key=key, value=json.dumps(value), updated_by=actor.user_id
        )
    return {"data": {"updated": sorted(body.settings)}}


@router.get("/teacher-admin/audit-events")
async def search_audit_events(
    _actor: TeacherAdmin,
    connection: ActorDb,
    action: Annotated[str | None, Query(max_length=120)] = None,
    actor_user_id: Annotated[UUID | None, Query()] = None,
    target_id: Annotated[UUID | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = DEFAULT_PAGE_SIZE,
) -> dict[str, Any]:
    """Authorised audit history."""
    offset = (page - 1) * page_size
    rows = await repository.audit_events(
        connection,
        action=action,
        actor_user_id=actor_user_id,
        target_id=target_id,
        limit=page_size,
        offset=offset,
    )
    return {
        "data": [
            {
                "id": str(row["audit_event_id"]),
                "actor_user_id": (
                    str(row["actor_user_id"]) if row["actor_user_id"] else None
                ),
                "actor_role": str(row["actor_role"]) if row["actor_role"] else None,
                "action": row["action"],
                "target_type": row["target_type"],
                "target_id": str(row["target_id"]) if row["target_id"] else None,
                "request_id": row["request_id"],
                "details": (
                    json.loads(row["details"])
                    if isinstance(row["details"], str)
                    else row["details"]
                ),
                "occurred_at": row["occurred_at"],
            }
            for row in rows
        ],
        "meta": {"page": page, "page_size": page_size},
    }


@router.post("/teacher-admin/students/{student_id}/diagnostic-reset")
async def reset_diagnostic(
    _actor: TeacherAdmin,
    _session: SensitiveActor,
    connection: ActorDb,
    student_id: UUID,
    body: DiagnosticResetRequest,
) -> dict[str, Any]:
    """Void a learner's diagnostic and authorise a fresh sitting.

    One function, one transaction: the attempt is voided with the reason, the
    learner returns to "not started", the reassessment is authorised, and the
    whole thing is audited.
    """
    row = await repository.reset_diagnostic(
        connection,
        student_id=student_id,
        reason=body.reason,
        request_id=current_request_id(),
    )
    if row is None:
        raise ApiError(404, "That learner has no diagnostic attempt to reset")
    return {
        "data": {
            "attempt_id": str(row["attempt_id"]),
            "assessment_id": str(row["assessment_id"]),
            "student_id": str(row["student_id"]),
            "status": str(row["status"]),
            "voided_reason": row["voided_reason"],
            "voided_at": row["voided_at"],
        }
    }
