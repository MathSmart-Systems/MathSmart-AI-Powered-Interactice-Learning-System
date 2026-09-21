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

from fastapi import APIRouter, Query, Request, Response

from app.dependencies import ActorDb, CurrentActor, SensitiveActor, TeacherAdmin
from middleware.errors import ApiError
from middleware.request_context import current_request_id
from modules.shared.grade_scope import (
    MVP_GRADE_LEVEL,
    SCOPE_CODE,
    SCOPE_REFUSAL,
    is_mvp_level,
    name_contradicts_level,
)
from modules.shared.rules import DEFAULT_ACTIVITY_PASS_PERCENTAGE, DEFAULT_INTERVENTION_TRIGGER
from modules.teacher_admin import admin_repository as repository
from modules.teacher_admin.admin_repository import (
    ACTIVITIES,
    ACTIVITY_DELETION,
    ASSESSMENT_DELETION,
    ASSESSMENTS,
    COMPETENCIES,
    GRADES,
    LEARNING_MODULES,
    MODULE_DELETION,
    QUESTION_DELETION,
    QUESTIONS,
    SECTIONS,
    Deletable,
    Resource,
)
from modules.teacher_admin.admin_schemas import (
    AccountStatus,
    ActivityChanges,
    ActivityDraft,
    ActivityQuestions,
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
    QuestionDifficulty,
    QuestionDraft,
    QuestionType,
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


def _status_counts(row: Any) -> dict[str, int]:
    """Draft, published and archived totals, always all three and never absent.

    Zero is a count, not a missing value. A tab with nothing in it has to say
    so; leaving the number out is what made an empty state indistinguishable
    from one nobody had counted.
    """
    if row is None:
        return {"draft": 0, "published": 0, "archived": 0}
    return {state: int(row[state] or 0) for state in ("draft", "published", "archived")}


async def _list(
    connection: Any,
    resource: Resource,
    search: str | None,
    page: int,
    size: int,
    status: str | None = None,
) -> dict[str, Any]:
    """Execute paginated listing query for a resource and package in standard envelope."""
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


async def _create(
    connection: Any, resource: Resource, model: Any, extra: dict[str, Any] | None = None
) -> dict[str, Any]:
    row = await repository.create(connection, resource, {**_values(model), **(extra or {})})
    if row is None:
        raise ApiError(422, "The record could not be created", code="not_created")
    return {"data": _row(row, resource)}


async def _update(connection: Any, resource: Resource, key: UUID, model: Any) -> dict[str, Any]:
    row = await repository.update(connection, resource, key, _values(model))
    if row is None:
        raise ApiError(404, "No record was found")
    return {"data": _row(row, resource)}


#: What each referencing table is called in a sentence a teacher reads.
_REFERENCE_NAMES = {
    "questions": "question",
    "learning_modules": "learning module",
    "competency_progress": "learner progress record",
    "competency_results": "assessment result",
    "learning_path_items": "learning path item",
    "interventions": "intervention",
    "delivered_questions": "delivered question",
}


def _describe_references(holding: dict[str, int]) -> str:
    """"3 questions and 1 learning module", in the order the plan lists them."""
    parts = []
    for key, name in _REFERENCE_NAMES.items():
        count = holding.get(key)
        if not count:
            continue
        parts.append(f"{count} {name}{'s' if count != 1 else ''}")
    if len(parts) > 1:
        return f"{', '.join(parts[:-1])} and {parts[-1]}"
    return parts[0] if parts else "Other records"


async def _archive(connection: Any, resource: Resource, key: UUID) -> Response:
    archived = await repository.archive(connection, resource, key)
    if archived is None:
        raise ApiError(404, "No record was found")
    return Response(status_code=204)


#: What each referencing table is called when a refusal has to name it, in
#: both numbers. Written out rather than suffixed, because "2 activitys" is
#: what a teacher would have read otherwise.
_CONTENT_REFERENCE_NAMES = {
    "assessment_questions": ("assessment", "assessments"),
    "activity_questions": ("activity", "activities"),
    "assessment_responses": ("delivered assessment question", "delivered assessment questions"),
    "activity_responses": ("delivered activity question", "delivered activity questions"),
    "activities": ("activity", "activities"),
    "learning_path_items": ("learning path item", "learning path items"),
    "student_module_progress": ("learner progress record", "learner progress records"),
    "activity_attempts": ("learner attempt", "learner attempts"),
    "assessment_attempts": ("learner attempt", "learner attempts"),
    "reassessment_authorizations": ("reassessment authorization", "reassessment authorizations"),
}


def _describe_content_references(holding: dict[str, int]) -> str:
    """"3 assessments and 1 learner attempt", in the order they were counted."""
    parts = []
    for key, count in holding.items():
        if not count:
            continue
        fallback = key.replace("_", " ")
        singular, plural = _CONTENT_REFERENCE_NAMES.get(key, (fallback, fallback))
        parts.append(f"{count} {singular if count == 1 else plural}")
    if len(parts) > 1:
        return f"{', '.join(parts[:-1])} and {parts[-1]}"
    return parts[0] if parts else "Other records"


async def _reference_preview(
    connection: Any, kind: Deletable, key: UUID
) -> tuple[Any, dict[str, int], dict[str, int]]:
    """The record, every count against it, and the subset that would refuse it.

    Authoritative in the only sense that matters: it is read inside the same
    transaction the deletion runs in, with the record locked, so the preview a
    teacher confirms against cannot go stale between the two.
    """
    state = await repository.deletion_state(connection, kind, key)
    if state is None:
        raise ApiError(404, f"No {kind.noun} was found")

    counts = await repository.deletion_references(connection, kind, key)
    references = {name: int(value or 0) for name, value in dict(counts).items()}
    holding = {
        name: value
        for name, value in references.items()
        if value and name not in kind.disposable
    }
    return state, references, holding


async def _read_references(connection: Any, kind: Deletable, key: UUID) -> dict[str, Any]:
    """What still points at this record, and whether it could be removed."""
    state, references, holding = await _reference_preview(connection, kind, key)

    return {
        "data": {
            "id": str(state[0]),
            "label": state["label"],
            "status": str(state["status"]),
            "references": references,
            "total": sum(references.values()),
            "blocking": holding,
            "blocking_total": sum(holding.values()),
            # Disposable membership goes with the record. It is reported so the
            # confirmation can say so, never counted against removal.
            "removable": not holding and str(state["status"]) == "archived",
        }
    }


async def _delete_record(
    connection: Any, kind: Deletable, key: UUID, actor: Any
) -> Response:
    """Permanently remove one authored record that was never used.

    Not the `DELETE` verb: that one archives, and has meant that since these
    modules were written. This is the other thing — a prompt typed wrong, a
    draft abandoned, a duplicate — where archiving only leaves an entry nobody
    can clear.

    Three conditions, and only the first is decided here. The row policy admits
    only an archived record, so removal is always a second decision after a
    reversible one. Every foreign key a learner record holds is ON DELETE
    RESTRICT, so anything still in use is refused by PostgreSQL whatever this
    route believes. The count below exists to explain a refusal, not to be
    trusted instead of it — and it is read with the row locked, inside the same
    transaction as the delete, so the preview cannot go stale in between.
    """
    state, references, holding = await _reference_preview(connection, kind, key)

    if str(state["status"]) != "archived":
        raise ApiError(
            422,
            f"Archive this {kind.noun} before deleting it, so removing one is always a "
            "second, separate decision.",
            code=f"{kind.target_type}_not_archived",
        )

    if holding:
        raise ApiError(
            422,
            f"This {kind.noun} is still in use, so it cannot be removed. "
            f"{_describe_content_references(holding)} still point at it.",
            code=f"{kind.target_type}_in_use",
            fields={"references": [f"{name}: {count}" for name, count in holding.items()]},
        )

    deleted = await repository.delete_record(connection, kind, key)
    if deleted is None:
        raise ApiError(404, f"No {kind.noun} was found")

    # Sanitized: counts and a status, never a prompt, a title, an answer key or
    # anything a learner wrote. The audit trail is not a place for content.
    await repository.record_audit_event(
        connection,
        action=kind.action,
        target_type=kind.target_type,
        target_id=key,
        request_id=current_request_id(),
        details={
            "status": str(state["status"]),
            "references": {name: count for name, count in references.items() if count},
        },
    )
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
    """Create a competency draft, in the one grade MathSmart teaches.

    The grade is resolved here and never taken from the request, exactly as it
    is for a section. MathSmart teaches Grade 6; a competency hung off another
    grade has no learners, no assessments and no modules behind it, and the
    interface offering only one grade is not the boundary — this is.
    """
    return await _create(
        connection, COMPETENCIES, body, {"grade_id": await _mvp_grade_id(connection)}
    )


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
    """Change a competency, including its publication state.

    Publishing, unpublishing and restoring an archived competency are all this
    one call with a different `status`. The grade is not among the fields a
    request may set: a competency cannot be moved out of the grade MathSmart
    teaches, any more than it could be created outside it.
    """
    return await _update(connection, COMPETENCIES, competency_id, body)


@router.get("/teacher-admin/competencies/{competency_id}/references")
async def read_competency_references(
    _actor: TeacherAdmin, connection: ActorDb, competency_id: UUID
) -> dict[str, Any]:
    """What still points at this competency.

    Read before archiving, unpublishing or deleting, so each of those can say
    what it is about to affect. Archiving and unpublishing do not remove
    anything, but they do take a competency's questions and modules out of
    every learner's view — and a teacher deserves to know that before, not
    after.
    """
    state = await repository.competency_state(connection, competency_id)
    if state is None:
        raise ApiError(404, "No competency was found")

    counts = await repository.competency_references(connection, competency_id)
    references = {key: int(value or 0) for key, value in dict(counts).items()}

    return {
        "data": {
            "competency_id": str(state["competency_id"]),
            "code": state["code"],
            "status": str(state["status"]),
            "references": references,
            "total": sum(references.values()),
        }
    }


@router.post("/teacher-admin/competencies/{competency_id}/delete", status_code=204)
async def delete_competency(
    _actor: TeacherAdmin,
    _session: SensitiveActor,
    connection: ActorDb,
    competency_id: UUID,
) -> Response:
    """Permanently remove a competency that was never used.

    Not the `DELETE` verb: that one archives, and has meant that since this
    module was written. This is the other thing — a code typed wrong, a draft
    abandoned, a duplicate — where archiving only leaves an entry nobody can
    clear.

    Two conditions, neither of them decided here. The row policy admits only an
    archived competency, so removal is always a second decision after a
    reversible one. And every foreign key pointing at a competency is
    ON DELETE RESTRICT, so anything still in use is refused by PostgreSQL
    whatever this route believes. The count below exists to explain a refusal,
    not to be trusted instead of it.
    """
    state = await repository.competency_state(connection, competency_id)
    if state is None:
        raise ApiError(404, "No competency was found")

    if str(state["status"]) != "archived":
        raise ApiError(
            422,
            "Archive this competency before deleting it, so removing one is always a "
            "second, separate decision.",
            code="competency_not_archived",
        )

    counts = await repository.competency_references(connection, competency_id)
    references = {key: int(value or 0) for key, value in dict(counts).items()}
    holding = {key: value for key, value in references.items() if value}

    if holding:
        raise ApiError(
            422,
            "This competency is still in use, so it cannot be removed. "
            f"{_describe_references(holding)} still point at it.",
            code="competency_in_use",
            fields={"references": [f"{key}: {value}" for key, value in holding.items()]},
        )

    deleted = await repository.delete_competency(connection, competency_id)
    if deleted is None:
        raise ApiError(404, "No competency was found")
    return Response(status_code=204)


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
    status: Annotated[PublicationStatus | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = DEFAULT_PAGE_SIZE,
) -> dict[str, Any]:
    offset = (page - 1) * page_size
    status_value = status.value if status else None
    rows = await repository.module_listing(
        connection,
        search=search,
        status=status_value,
        limit=page_size,
        offset=offset,
    )
    total = await repository.module_listing_total(
        connection, search=search, status=status_value
    )
    envelope = _envelope(list(rows), LEARNING_MODULES, total, page, page_size)
    counts = await repository.module_status_counts(connection, search=search)
    envelope["meta"]["status_counts"] = _status_counts(counts)
    return envelope


@router.post("/teacher-admin/modules", status_code=201)
async def create_module(
    _actor: TeacherAdmin, _session: SensitiveActor, connection: ActorDb, body: ModuleDraft
) -> dict[str, Any]:
    if body.status is PublicationStatus.PUBLISHED:
        competency_is_published = await repository.lock_published_competency(
            connection, body.competency_id
        )
        if not competency_is_published:
            raise ApiError(
                422,
                "Publish the competency before publishing the module.",
                code="module_not_publishable",
            )
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
    current = await repository.module_write_state(connection, module_id)
    if current is None:
        raise ApiError(404, "No record was found")

    values = _values(body)
    competency_id = values.get("competency_id", current["competency_id"])
    status = values.get("status", current["status"])

    if status == PublicationStatus.PUBLISHED and not await repository.lock_published_competency(
        connection, competency_id
    ):
        raise ApiError(
            422,
            "Publish the competency before publishing the module.",
            code="module_not_publishable",
        )

    row = await repository.update(connection, LEARNING_MODULES, module_id, values)
    if row is None:
        raise ApiError(404, "No record was found")
    return {"data": _row(row, LEARNING_MODULES)}


@router.get("/teacher-admin/modules/{module_id}/references")
async def read_module_references(
    _actor: TeacherAdmin, connection: ActorDb, module_id: UUID
) -> dict[str, Any]:
    """What still points at this module, read before archiving or deleting."""
    return await _read_references(connection, MODULE_DELETION, module_id)


@router.post("/teacher-admin/modules/{module_id}/delete", status_code=204)
async def delete_module(
    _actor: TeacherAdmin,
    actor: CurrentActor,
    _session: SensitiveActor,
    connection: ActorDb,
    module_id: UUID,
) -> Response:
    """Permanently remove a module that was never used."""
    return await _delete_record(connection, MODULE_DELETION, module_id, actor)


@router.post("/teacher-admin/modules/{module_id}/restore")
async def restore_module(
    _actor: TeacherAdmin,
    _session: SensitiveActor,
    connection: ActorDb,
    module_id: UUID,
) -> dict[str, Any]:
    """Bring an archived module back as a draft, into a place that is free.

    Archiving a module frees its place in the competency, because
    `learning_modules_competency_order_key` exempts archived rows — so the
    normal thing that happens next is that another module takes it. Restoring
    the row by setting its status alone then violated that index, and the
    teacher was told "Another record already uses one of those values" on a
    control that offered no way to change the order.

    The place is checked and, when it is taken, the module is restored after
    the competency's last live module instead. Both statements run inside the
    request's transaction with the row locked, so nothing can claim the place
    between the check and the write. The response says where it landed, because
    a module that quietly moved in the learning path is not a detail.
    """
    current = await repository.module_restore_state(connection, module_id)
    if current is None:
        raise ApiError(404, "No record was found")

    if str(current["module_status"]) != "archived":
        raise ApiError(
            422,
            "Only an archived module can be restored.",
            code="module_not_archived",
        )

    competency_id = current["competency_id"]
    order_index = current["order_index"]
    moved = await repository.module_order_is_taken(
        connection,
        competency_id=competency_id,
        order_index=order_index,
        module_id=module_id,
    )

    values: dict[str, Any] = {"status": "draft"}
    if moved:
        order_index = await repository.next_module_order(connection, competency_id)
        values["order_index"] = order_index

    row = await repository.update(connection, LEARNING_MODULES, module_id, values)
    if row is None:
        raise ApiError(404, "No record was found")

    return {"data": {**_row(row, LEARNING_MODULES), "order_index_changed": moved}}


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
    module_id: UUID | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = DEFAULT_PAGE_SIZE,
) -> dict[str, Any]:
    """List activity definitions with search, status, and module filters."""
    offset = (page - 1) * page_size
    status_str = status.value if status else None
    rows = await repository.list_activities(
        connection,
        search=search,
        limit=page_size,
        offset=offset,
        status=status_str,
        module_id=module_id,
    )
    total = await repository.count_activities(
        connection,
        search=search,
        status=status_str,
        module_id=module_id,
    )
    envelope = _envelope(list(rows), ACTIVITIES, total, page, page_size)

    # The count decides whether a row can be published at all, so a listing
    # that omitted it would have to disable publication everywhere or guess.
    #
    # `is_ready` is the other half of that. A row saying "published" told the
    # teacher nothing about whether a learner could open it, so an activity
    # published with no questions, or holding a question under a draft
    # competency, sat in the workspace looking live while every learner who
    # tried it was refused. `readiness_reason` says which of those it is,
    # because a boolean sends the teacher looking. All three come from one
    # statement, so the listing cannot pair a count with somebody else's
    # readiness.
    setup = await repository.activity_setup_status(
        connection, [UUID(row["activity_id"]) for row in envelope["data"]]
    )
    for row in envelope["data"]:
        status_row = setup.get(UUID(row["activity_id"]), repository.MISSING_SETUP)
        row["question_count"] = status_row.question_count
        row["is_ready"] = status_row.is_ready
        row["readiness_reason"] = status_row.reason
    return envelope


@router.post("/teacher-admin/activities", status_code=201)
async def create_activity(
    _actor: TeacherAdmin, _session: SensitiveActor, connection: ActorDb, body: ActivityDraft
) -> dict[str, Any]:
    """Author and create a new activity draft associated with a learning module."""
    return await _create(connection, ACTIVITIES, body)


@router.get("/teacher-admin/activities/{activity_id}")
async def read_activity_draft(
    _actor: TeacherAdmin, connection: ActorDb, activity_id: UUID
) -> dict[str, Any]:
    """One activity, with its membership in the order a learner meets it.

    Membership replacement is whole-list, so an editor that could not read the
    current order would erase it on its first save.
    """
    payload = await _read(connection, ACTIVITIES, activity_id)
    questions = await repository.activity_membership_questions(connection, activity_id)
    payload["data"]["questions"] = [_row(question, QUESTIONS) for question in questions]
    payload["data"]["question_ids"] = [str(question["question_id"]) for question in questions]
    payload["data"]["question_count"] = len(questions)
    return payload


async def _activity_readiness(connection: Any, activity_id: UUID) -> Any:
    """Everything an activity's publication depends on, read in one statement."""
    readiness = await repository.activity_publication_readiness(connection, activity_id)
    if readiness is None:
        raise ApiError(404, "No activity was found")
    return readiness


def _refuse_unready_activity(readiness: Any) -> None:
    """Refuse an activity that is not safe to put in front of a learner.

    One implementation for two routes, because there were two ways to reach
    `published` and only one of them checked anything. `POST .../publish` asked
    all of these questions; `PATCH .../{id}` took `status: "published"` as an
    ordinary column write and asked none — so the entire check below was one
    request away from being skipped, and activities with no questions at all
    reached learners that way.

    Six conditions, and the refusal names the one that failed: the activity is
    a draft, it holds at least one question, every one of those questions is
    published, every one of *their* competencies is published, and its module
    and that module's competency are published too. The last two are what
    `activities_select` requires before a learner can see it at all; the rest
    are what `app.start_activity_attempt` requires before it will deliver it.
    """
    if readiness["activity_status"] != "draft":
        raise ApiError(
            422, "Only a draft activity can be published", code="activity_not_publishable"
        )
    if readiness["question_total"] < 1:
        raise ApiError(
            422,
            "An activity needs at least one question before it can be published",
            code="activity_not_publishable",
        )
    if readiness["unpublished_total"] > 0:
        raise ApiError(
            422,
            "Every question in the activity must be published first",
            code="activity_not_publishable",
        )
    if readiness["unpublished_competency_total"] > 0:
        raise ApiError(
            422,
            "Every competency behind the activity's questions must be published first",
            code="activity_not_publishable",
        )
    if readiness["module_status"] != "published":
        raise ApiError(
            422,
            "Publish the learning module before publishing its activity",
            code="activity_not_publishable",
        )
    if readiness["competency_status"] != "published":
        raise ApiError(
            422,
            "Publish the competency before publishing this activity",
            code="activity_not_publishable",
        )


@router.patch("/teacher-admin/activities/{activity_id}")
async def update_activity(
    _actor: TeacherAdmin,
    _session: SensitiveActor,
    connection: ActorDb,
    activity_id: UUID,
    body: ActivityChanges,
) -> dict[str, Any]:
    """Partially update an activity's metadata, threshold, or publication status.

    A change that would move the activity to `published` meets exactly the
    checks `POST .../publish` applies, because it is the same decision reached
    by a different verb. It used to meet none of them: `status` was an ordinary
    column here, so a teacher whose publish had been refused could send the
    same value through the edit form and the activity went live empty.

    An activity that is already published is left alone: the request is not
    moving it anywhere, and refusing a title change because the activity has a
    draft question in it would make the edit form unusable for the correction
    the teacher is trying to make.
    """
    values = _values(body)
    if values.get("status") == PublicationStatus.PUBLISHED:
        readiness = await _activity_readiness(connection, activity_id)
        if readiness["activity_status"] != "published":
            _refuse_unready_activity(readiness)

    row = await repository.update(connection, ACTIVITIES, activity_id, values)
    if row is None:
        raise ApiError(404, "No record was found")
    return {"data": _row(row, ACTIVITIES)}


@router.get("/teacher-admin/activities/{activity_id}/references")
async def read_activity_references(
    _actor: TeacherAdmin, connection: ActorDb, activity_id: UUID
) -> dict[str, Any]:
    """What still points at this activity, read before archiving or deleting."""
    return await _read_references(connection, ACTIVITY_DELETION, activity_id)


@router.post("/teacher-admin/activities/{activity_id}/delete", status_code=204)
async def delete_activity(
    _actor: TeacherAdmin,
    actor: CurrentActor,
    _session: SensitiveActor,
    connection: ActorDb,
    activity_id: UUID,
) -> Response:
    """Permanently remove an activity nobody ever attempted.

    Its membership rows go with it, because a row saying "this activity
    contains this question" has no meaning once the activity is gone. The
    questions they name do not: `app.activity_questions.question_id` is ON
    DELETE RESTRICT, so a reusable question cannot be reached this way.
    """
    return await _delete_record(connection, ACTIVITY_DELETION, activity_id, actor)


@router.put("/teacher-admin/activities/{activity_id}/questions")
async def replace_activity_questions(
    _actor: TeacherAdmin,
    _session: SensitiveActor,
    connection: ActorDb,
    activity_id: UUID,
    body: ActivityQuestions,
) -> dict[str, Any]:
    """Replace the ordered membership.

    The whole list is replaced inside the request's transaction, so a partial
    membership is never visible: the position of each question is its place in
    the list that was sent. The same shape the assessment membership has had
    since it was written — activities simply had no way to author theirs at
    all, so an activity's questions could only be set outside the application.

    An activity somebody is part-way through is refused. Their attempt keeps
    its own frozen copy of the questions, so their grading would survive this —
    but the two would then disagree about what the activity is, and a learner
    would watch the questions change under them.
    """
    row = await repository.read(connection, ACTIVITIES, activity_id)
    if row is None:
        raise ApiError(404, "No activity was found")

    open_attempts = await repository.activity_open_attempts(connection, activity_id)
    if open_attempts:
        raise ApiError(
            409,
            f"{open_attempts} learner{'s are' if open_attempts != 1 else ' is'} part-way "
            "through this activity. Its questions cannot change until they finish.",
            code="activity_in_progress",
        )

    await repository.replace_activity_questions(
        connection, activity_id=activity_id, question_ids=body.question_ids
    )
    return {
        "data": {
            **_row(row, ACTIVITIES),
            "question_ids": [str(question_id) for question_id in body.question_ids],
            "question_count": len(body.question_ids),
        }
    }


@router.post("/teacher-admin/activities/{activity_id}/publish")
async def publish_activity(
    _actor: TeacherAdmin, _session: SensitiveActor, connection: ActorDb, activity_id: UUID
) -> dict[str, Any]:
    """Publish an activity, once it is safe to deliver.

    Publishing used to be a `status` on the edit form with nothing behind it.
    An activity with no questions published fine, and then
    `app.start_activity_attempt` — which checks the activity's own status and
    not its module's — let a learner start it, delivered nothing, scored the
    submission zero, and fed that zero into the competency progress that opens
    an intervention.

    The conditions are in `_refuse_unready_activity`, which `PATCH
    .../{activity_id}` runs too: publishing by editing the status field used to
    be the way round every one of them.
    """
    readiness = await _activity_readiness(connection, activity_id)
    _refuse_unready_activity(readiness)

    row = await repository.update(connection, ACTIVITIES, activity_id, {"status": "published"})
    if row is None:
        raise ApiError(404, "No activity was found")
    return {
        "data": {**_row(row, ACTIVITIES), "question_count": readiness["question_total"]}
    }


@router.delete("/teacher-admin/activities/{activity_id}", status_code=204)
async def archive_activity(
    _actor: TeacherAdmin, _session: SensitiveActor, connection: ActorDb, activity_id: UUID
) -> Response:
    """Soft-archive an activity, preserving student attempt history and references."""
    return await _archive(connection, ACTIVITIES, activity_id)


# ---------------------------------------------------------------------------
# The question bank
# ---------------------------------------------------------------------------


@router.get("/teacher-admin/questions")
async def list_questions(
    _actor: TeacherAdmin,
    connection: ActorDb,
    search: Annotated[str | None, Query(max_length=MAX_SEARCH_LENGTH)] = None,
    status: Annotated[PublicationStatus | None, Query()] = None,
    competency_id: Annotated[UUID | None, Query()] = None,
    question_type: Annotated[QuestionType | None, Query()] = None,
    difficulty: Annotated[QuestionDifficulty | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = DEFAULT_PAGE_SIZE,
) -> dict[str, Any]:
    """The question bank, narrowed before its page is selected.

    Every filter is applied in the statement rather than over the returned page.
    A bank sorted out in the browser can only report on the rows it was handed,
    so the tab counts and the "21-40 of 118" caption would describe a different
    set from the one on screen — and a status with no rows on this page would
    look empty however many it holds.

    No response here carries an answer key.
    """
    filters = {
        "status": status.value if status else None,
        "competency_id": competency_id,
        "question_type": question_type.value if question_type else None,
        "difficulty": difficulty.value if difficulty else None,
    }
    offset = (page - 1) * page_size
    rows = await repository.question_listing(
        connection, search=search, limit=page_size, offset=offset, **filters
    )
    total = await repository.question_listing_total(connection, search=search, **filters)
    envelope = _envelope(list(rows), QUESTIONS, total, page, page_size)

    # Every state's total, so each tab can say what it holds — including when
    # what it holds is nothing. Counted under the other filters but not under
    # the state, which is the only reading that lets the three add up.
    counts = await repository.question_status_counts(
        connection,
        search=search,
        competency_id=competency_id,
        question_type=filters["question_type"],
        difficulty=filters["difficulty"],
    )
    envelope["meta"]["status_counts"] = _status_counts(counts)
    return envelope


async def _refuse_unpublished_competency(connection: Any, competency_id: UUID) -> None:
    """A published question needs a published competency behind it.

    `questions_select` shows a learner a published question only when its
    competency is published too, so publishing into a draft competency produces
    a question nobody can be given and nothing says so. Modules have refused
    this since they were written; the bank did not, which is the whole
    difference this raises.
    """
    if not await repository.lock_published_competency(connection, competency_id):
        raise ApiError(
            422,
            "Publish the competency before publishing the question.",
            code="question_not_publishable",
            fields={
                "competency_id": [
                    "Learners can only be given this question once its competency "
                    "is published."
                ]
            },
        )


@router.post("/teacher-admin/questions", status_code=201)
async def create_question(
    _actor: TeacherAdmin, _session: SensitiveActor, connection: ActorDb, body: QuestionDraft
) -> dict[str, Any]:
    """Author a question, answer key included. The key is written, never read back."""
    if body.status is PublicationStatus.PUBLISHED:
        await _refuse_unpublished_competency(connection, body.competency_id)
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
    """Change a question, including its publication state.

    A change that publishes is checked against the competency it will end up
    under, which is the one it names or, when it names none, the one already
    stored. The row is locked first so the two cannot disagree.
    """
    current = await repository.question_write_state(connection, question_id)
    if current is None:
        raise ApiError(404, "No record was found")

    values = _values(body)
    status = values.get("status", current["question_status"])

    if status == PublicationStatus.PUBLISHED:
        await _refuse_unpublished_competency(
            connection, values.get("competency_id", current["competency_id"])
        )

    row = await repository.update(connection, QUESTIONS, question_id, values)
    if row is None:
        raise ApiError(404, "No record was found")
    return {"data": _row(row, QUESTIONS)}


@router.get("/teacher-admin/questions/{question_id}/references")
async def read_question_references(
    _actor: TeacherAdmin, connection: ActorDb, question_id: UUID
) -> dict[str, Any]:
    """What still points at this question, read before archiving or deleting."""
    return await _read_references(connection, QUESTION_DELETION, question_id)


@router.post("/teacher-admin/questions/{question_id}/delete", status_code=204)
async def delete_question(
    _actor: TeacherAdmin,
    actor: CurrentActor,
    _session: SensitiveActor,
    connection: ActorDb,
    question_id: UUID,
) -> Response:
    """Permanently remove a question that was never used."""
    return await _delete_record(connection, QUESTION_DELETION, question_id, actor)


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
    """Assessments, each row carrying how many questions it holds and whether
    a learner could actually open it.

    The count decides whether a row can be published at all, so a listing that
    omitted it would have to disable publication everywhere or guess. `is_ready`
    is the other half: a row saying "published" told the teacher nothing about
    what was inside it, so a paper published empty, or holding a question under
    a draft competency, looked live in the workspace while every learner who
    opened it was refused by `app.start_assessment_attempt`.
    `readiness_reason` names which of those it is, because "not ready" on its
    own sends the teacher searching for the difference.
    """
    envelope = await _list(
        connection, ASSESSMENTS, search, page, page_size, status.value if status else None
    )
    setup = await repository.assessment_setup_status(
        connection, [UUID(row["assessment_id"]) for row in envelope["data"]]
    )
    for row in envelope["data"]:
        status_row = setup.get(UUID(row["assessment_id"]), repository.MISSING_SETUP)
        row["question_count"] = status_row.question_count
        row["is_ready"] = status_row.is_ready
        row["readiness_reason"] = status_row.reason

    states = await repository.assessment_status_counts(connection, search=search)
    envelope["meta"]["status_counts"] = _status_counts(states)
    return envelope


@router.post("/teacher-admin/assessments", status_code=201)
async def create_assessment(
    _actor: TeacherAdmin, _session: SensitiveActor, connection: ActorDb, body: AssessmentDraft
) -> dict[str, Any]:
    """Create an assessment draft, in the one grade MathSmart teaches.

    The grade is resolved here and never taken from the request, exactly as it
    is for a competency and for a section. The workspace used to offer a grade
    picker, which made the product's one curriculum invariant a value a client
    could choose; an assessment under another grade has no learners and no
    competencies behind it. The interface offering one grade is not the
    boundary — this is.
    """
    return await _create(
        connection, ASSESSMENTS, body, {"grade_id": await _mvp_grade_id(connection)}
    )


@router.get("/teacher-admin/assessments/{assessment_id}")
async def read_assessment_draft(
    _actor: TeacherAdmin, connection: ActorDb, assessment_id: UUID
) -> dict[str, Any]:
    """One assessment, with its membership in delivery order.

    Membership replacement is whole-list, so an editor that could not read the
    current order would erase it on its first save.
    """
    payload = await _read(connection, ASSESSMENTS, assessment_id)
    questions = await repository.assessment_membership_questions(connection, assessment_id)
    payload["data"]["questions"] = [_row(question, QUESTIONS) for question in questions]
    payload["data"]["question_ids"] = [str(question["question_id"]) for question in questions]
    payload["data"]["question_count"] = len(questions)
    return payload


async def _assessment_readiness(connection: Any, assessment_id: UUID) -> Any:
    """Everything an assessment's publication depends on, in one statement."""
    readiness = await repository.assessment_publication_readiness(connection, assessment_id)
    if readiness is None:
        raise ApiError(404, "No assessment was found")
    return readiness


def _refuse_unready_assessment(readiness: Any) -> None:
    """Refuse an assessment that is not safe to sit.

    One implementation for two routes, for the same reason the activity rules
    are: `POST .../publish` asked these questions and `PATCH .../{id}` asked
    none, so sending `status: "published"` through the edit form published
    anything at all.

    An empty assessment would hand a learner nothing to answer and then score
    them zero. A question that is still a draft, a question whose competency is
    still a draft, or a grade that is no longer active would reach the learner
    just as broken — and the competency is the one that used to be checked
    nowhere: `app.start_assessment_attempt` counts a question as deliverable
    only when the question *and* its competency are published, so a paper that
    passed publication here still refused to open.
    """
    if readiness["assessment_status"] != "draft":
        raise ApiError(
            422,
            "Only a draft assessment can be published",
            code="assessment_not_publishable",
        )
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
    if readiness["unpublished_competency_total"] > 0:
        raise ApiError(
            422,
            "Every competency behind the assessment's questions must be published first",
            code="assessment_not_publishable",
        )
    if not readiness["grade_is_active"]:
        raise ApiError(
            422,
            "The assessment's grade level is not active",
            code="assessment_not_publishable",
        )


@router.patch("/teacher-admin/assessments/{assessment_id}")
async def update_assessment(
    _actor: TeacherAdmin,
    _session: SensitiveActor,
    connection: ActorDb,
    assessment_id: UUID,
    body: AssessmentChanges,
) -> dict[str, Any]:
    """Change an assessment, including its publication state.

    A change that would move it to `published` meets exactly the checks
    `POST .../publish` applies, because it is the same decision reached by a
    different verb. It used to meet none of them, which is how a paper whose
    question sat under a draft competency went live.

    An assessment that is already published is left alone: the request is not
    moving it anywhere, and a teacher correcting its title should not be
    refused over what is inside it.
    """
    values = _values(body)
    if values.get("status") == PublicationStatus.PUBLISHED:
        readiness = await _assessment_readiness(connection, assessment_id)
        if readiness["assessment_status"] != "published":
            _refuse_unready_assessment(readiness)

    row = await repository.update(connection, ASSESSMENTS, assessment_id, values)
    if row is None:
        raise ApiError(404, "No record was found")
    return {"data": _row(row, ASSESSMENTS)}


@router.delete("/teacher-admin/assessments/{assessment_id}", status_code=204)
async def archive_assessment(
    _actor: TeacherAdmin, _session: SensitiveActor, connection: ActorDb, assessment_id: UUID
) -> Response:
    return await _archive(connection, ASSESSMENTS, assessment_id)


@router.get("/teacher-admin/assessments/{assessment_id}/references")
async def read_assessment_references(
    _actor: TeacherAdmin, connection: ActorDb, assessment_id: UUID
) -> dict[str, Any]:
    """What still points at this assessment, read before archiving or deleting."""
    return await _read_references(connection, ASSESSMENT_DELETION, assessment_id)


@router.post("/teacher-admin/assessments/{assessment_id}/delete", status_code=204)
async def delete_assessment(
    _actor: TeacherAdmin,
    actor: CurrentActor,
    _session: SensitiveActor,
    connection: ActorDb,
    assessment_id: UUID,
) -> Response:
    """Permanently remove an assessment nobody ever attempted.

    Its membership rows go with it; the questions they name do not.
    """
    return await _delete_record(connection, ASSESSMENT_DELETION, assessment_id, actor)


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

    The conditions are in `_refuse_unready_assessment`, which
    `PATCH .../{assessment_id}` runs too: publishing by editing the status
    field used to be the way round every one of them.
    """
    readiness = await _assessment_readiness(connection, assessment_id)
    _refuse_unready_assessment(readiness)

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


@router.post("/teacher-admin/assessments/{assessment_id}/unpublish")
async def unpublish_assessment(
    _actor: TeacherAdmin, _session: SensitiveActor, connection: ActorDb, assessment_id: UUID
) -> dict[str, Any]:
    """Return a published assessment to draft so it can be corrected.

    A route of its own rather than a `status` patch, because the decision is
    not just a column. `start_assessment_attempt` opens *and* resumes, and it
    only ever finds a published assessment: returning one to draft while a
    learner is part-way through their paper would lock them out of their own
    answers. So an assessment with an attempt in progress is refused, and the
    teacher is told how many.
    """
    current = await repository.read(connection, ASSESSMENTS, assessment_id)
    if current is None:
        raise ApiError(404, "No assessment was found")

    if current["status"] != "published":
        raise ApiError(
            422,
            "Only a published assessment can be returned to draft",
            code="assessment_not_unpublishable",
        )

    open_attempts = await repository.assessment_open_attempts(connection, assessment_id)
    if open_attempts > 0:
        raise ApiError(
            409,
            f"{open_attempts} learner attempt(s) are still in progress, so this assessment "
            "cannot be returned to draft yet.",
            code="assessment_in_progress",
        )

    row = await repository.update(
        connection, ASSESSMENTS, assessment_id, {"status": "draft"}
    )
    if row is None:
        raise ApiError(404, "No assessment was found")
    return {"data": _row(row, ASSESSMENTS)}


# ---------------------------------------------------------------------------
# Grades and sections
# ---------------------------------------------------------------------------


async def _grade_or_404(connection: Any, grade_id: UUID) -> Any:
    row = await repository.read(connection, GRADES, grade_id)
    if row is None:
        raise ApiError(404, "No grade was found")
    return row


async def _mvp_grade_id(connection: Any) -> UUID:
    """The grade every section belongs to, resolved on the server.

    The client never names a grade. If the seeded record is missing this
    refuses rather than inventing one: creating a second grade to hang a
    section off would be the exact thing the scope rule exists to prevent.
    """
    grade_id = await repository.mvp_grade(connection, MVP_GRADE_LEVEL)
    if grade_id is None:
        raise ApiError(
            503,
            f"The Grade {MVP_GRADE_LEVEL} record is missing from this deployment, so a "
            "section cannot be created. Restore it from the database seed.",
            code="mvp_grade_missing",
        )
    return grade_id


async def _refuse_unknown_adviser(connection: Any, adviser_id: UUID | None) -> None:
    """Refuse a section whose adviser is not one who may advise it.

    `sections.adviser_id` references `teacher_admin_profiles.teacher_admin_id`,
    which is that profile's own key and not the account's `user_id`. Sending
    the account id used to reach the database and come back as a foreign key
    violation — a 500 with no CORS headers, which a browser can only report as
    "Failed to fetch". Checking here turns that into something a teacher can
    read and act on, and it also catches an adviser who has since been
    deactivated.
    """
    if adviser_id is None:
        return

    if await repository.adviser(connection, adviser_id) is None:
        raise ApiError(
            422,
            "That adviser is not an active Teacher/Administrator. "
            "Choose another, or leave the section unassigned.",
            code="adviser_unknown",
            fields={"adviser_id": ["Unknown or inactive adviser."]},
        )


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
    _actor: TeacherAdmin, _session: SensitiveActor, _connection: ActorDb, _body: GradeDraft
) -> dict[str, Any]:
    """Refused. The grade level is the product's scope, not a teacher's choice.

    The route stays so a caller gets this sentence rather than a bare 405.
    """
    raise ApiError(422, SCOPE_REFUSAL, code=SCOPE_CODE)


@router.patch("/teacher-admin/grades/{grade_id}")
async def update_grade(
    _actor: TeacherAdmin,
    _session: SensitiveActor,
    connection: ActorDb,
    grade_id: UUID,
    body: GradeChanges,
) -> dict[str, Any]:
    """Rename or reactivate a grade, within the one level MathSmart teaches.

    A level may only ever be set to the MVP level, which leaves a legacy record
    a way back into scope and no way further out of it. The name is checked
    against the level the record will actually have, so a row cannot read
    "Grade 3" while it is stored as Grade 6.
    """
    existing = await _grade_or_404(connection, grade_id)

    if body.level is not None and not is_mvp_level(body.level):
        raise ApiError(422, SCOPE_REFUSAL, code=SCOPE_CODE)

    level = body.level if body.level is not None else existing["level"]
    if name_contradicts_level(body.name, level):
        raise ApiError(
            422,
            f"This grade is level {level}, so its name cannot name a different grade.",
            code=SCOPE_CODE,
        )

    return await _update(connection, GRADES, grade_id, body)


@router.delete("/teacher-admin/grades/{grade_id}", status_code=204)
async def deactivate_grade(
    _actor: TeacherAdmin, _session: SensitiveActor, connection: ActorDb, grade_id: UUID
) -> Response:
    """A grade has no publication status, so retiring it deactivates it.

    The MVP grade itself is not retirable: every competency, module, assessment
    and section in the product hangs off it, and a teacher deactivating it
    would empty the curriculum rather than tidy the directory.
    """
    grade = await _grade_or_404(connection, grade_id)
    if is_mvp_level(grade["level"]):
        raise ApiError(
            422,
            f"Grade {MVP_GRADE_LEVEL} is the curriculum MathSmart teaches, "
            "so it cannot be deactivated.",
            code=SCOPE_CODE,
        )

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
    """Create a section under the one grade MathSmart teaches.

    The grade is the server's to decide. A client cannot name one — the schema
    forbids the field — so there is no request a caller can craft that puts a
    section anywhere else.
    """
    grade_id = await _mvp_grade_id(connection)
    await _refuse_unknown_adviser(connection, body.adviser_id)
    return await _create(connection, SECTIONS, body, {"grade_id": grade_id})


@router.patch("/teacher-admin/sections/{section_id}")
async def update_section(
    _actor: TeacherAdmin,
    _session: SensitiveActor,
    connection: ActorDb,
    section_id: UUID,
    body: SectionChanges,
) -> dict[str, Any]:
    """Update a section's name, adviser or availability.

    Its grade is not among them: there is one grade, the schema has no field
    for it, and a request that tries to add one is refused.
    """
    await _refuse_unknown_adviser(connection, body.adviser_id)
    return await _update(connection, SECTIONS, section_id, body)


@router.delete("/teacher-admin/sections/{section_id}", status_code=204)
async def deactivate_section(
    _actor: TeacherAdmin, _session: SensitiveActor, connection: ActorDb, section_id: UUID
) -> Response:
    """Retires a section. Reversible: the row stays and `is_active` goes false."""
    deactivated = await repository.deactivate(connection, SECTIONS, section_id)
    if deactivated is None:
        raise ApiError(404, "No section was found")
    return Response(status_code=204)


@router.delete("/teacher-admin/sections/{section_id}/record", status_code=204)
async def delete_section(
    _actor: TeacherAdmin, _session: SensitiveActor, connection: ActorDb, section_id: UUID
) -> Response:
    """Removes a retired section for good.

    A separate path from the deactivation above, which keeps its documented
    meaning. This one is for a section that should never have existed — a
    typo, a duplicate, a trial — and it is deliberately hard to reach:

    * the section has to be deactivated already, which is its own reversible
      decision taken separately and first;
    * no learner may still point at it, which is checked here so the refusal
      can say how many do, and enforced by ON DELETE RESTRICT regardless;
    * the row-level policy repeats both the role and the retired condition, so
      the database refuses even if this route is ever wrong.
    """
    section = await repository.read(connection, SECTIONS, section_id)
    if section is None:
        raise ApiError(404, "No section was found")

    if section["is_active"]:
        raise ApiError(
            422,
            "Deactivate this section before deleting it, so retiring a live class is "
            "always a separate decision.",
            code="section_active",
        )

    learners = await repository.section_learner_count(connection, section_id)
    if learners:
        raise ApiError(
            422,
            f"{learners} learner{'s' if learners != 1 else ''} still "
            f"belong{'' if learners != 1 else 's'} to this section. Move them to another "
            "section before deleting it.",
            code="section_in_use",
        )

    deleted = await repository.delete_section(connection, section_id)
    if deleted is None:
        raise ApiError(404, "No section was found")
    return Response(status_code=204)


# ---------------------------------------------------------------------------
# Accounts
# ---------------------------------------------------------------------------


def _user(row: Any) -> dict[str, Any]:
    # `teacher_admin_id` is what a section's adviser_id points at. It is absent
    # for a learner, and stated explicitly rather than left to be inferred from
    # the account id, which is a different value.
    teacher_admin_id = row["teacher_admin_id"] if "teacher_admin_id" in row else None
    return {
        "user_id": str(row["user_id"]),
        "teacher_admin_id": str(teacher_admin_id) if teacher_admin_id else None,
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
async def read_settings(
    _actor: TeacherAdmin, connection: ActorDb, request: Request
) -> dict[str, Any]:
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

    app_settings = getattr(request.app.state, "settings", None)
    env_groq_enabled = bool(getattr(app_settings, "groq_enabled", False))
    groq_model = getattr(app_settings, "groq_model", None)
    sanitized_model = str(groq_model).strip() if groq_model else None
    policy_enabled = bool(
        effective.get(
            "features.groq_advisory",
            effective.get(
                "features.groq_enabled",
                effective.get("features.groq_feedback_enabled", False),
            ),
        )
    )

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
                "enabled": policy_enabled and env_groq_enabled,
                "model": sanitized_model,
                "model_is_editable": False,
                "model_source": "server environment",
                "environment_enabled": env_groq_enabled,
                "policy_enabled": policy_enabled,
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
    await repository.record_audit_event(
        connection,
        action="settings.updated",
        target_type="system_settings",
        target_id=None,
        request_id=current_request_id(),
        details={"updated": sorted(body.settings), "updated_keys": sorted(body.settings)},
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
