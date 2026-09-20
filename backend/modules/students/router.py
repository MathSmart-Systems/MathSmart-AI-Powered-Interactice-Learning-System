"""Student routes.

`POST /students` is the only way a learner account comes into existence.
MathSmart accounts are administrator-provisioned; there is no public
registration, and the frozen route documentation's public register endpoint is
reported as a documentation mismatch rather than implemented.
"""

from __future__ import annotations

from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Request, Response

from app.dependencies import ActorDb, CurrentActor, SensitiveActor, TeacherAdmin
from middleware.errors import ApiError
from middleware.request_context import current_request_id
from modules.shared.grade_scope import MVP_GRADE_LEVEL, SCOPE_CODE, SCOPE_REFUSAL, is_mvp_level
from modules.students import repository
from modules.students.provisioning import (
    IdempotencyMismatch,
    ProvisioningConflict,
    ProvisioningFailed,
    StudentProvisioning,
)
from modules.students.purge import PurgeFailed, PurgeRefused, StudentPurge
from modules.students.schemas import (
    DropLearnersRequest,
    EnrolLearnerRequest,
    LearnerRecordChanges,
    LearnerSummary,
    OwnProfileChanges,
    PurgeLearnerRequest,
    RestoreLearnerRequest,
)

router = APIRouter(tags=["students"])

ROSTER_STATUSES = (repository.STATUS_ENROLLED, repository.STATUS_DROPPED, repository.STATUS_ALL)

MAX_PAGE_SIZE = 100
DEFAULT_PAGE_SIZE = 20
MIN_IDEMPOTENCY_KEY_LENGTH = 8


async def _refuse_enrolment_outside_scope(
    connection: Any, grade_id: UUID | None, section_id: UUID | None
) -> None:
    """Refuse an enrolment that would put a learner outside the curriculum.

    MathSmart teaches one grade. The interface never offers another, but the
    interface is not the boundary: a request is checked here so a crafted one
    cannot enrol a learner into a grade that has no competencies, no modules
    and no assessments behind it, or into a section that belongs to one.

    Read first, write second. Both reads run on the caller's own connection, so
    a grade or section they cannot see is indistinguishable from one that does
    not exist — which is the right answer either way.
    """
    if grade_id is not None:
        level = await repository.grade_level(connection, grade_id)
        if level is None:
            raise ApiError(
                422,
                "That grade level is not in the directory.",
                code=SCOPE_CODE,
                fields={"grade_id": ["Unknown grade level."]},
            )
        if not is_mvp_level(level):
            raise ApiError(
                422, SCOPE_REFUSAL, code=SCOPE_CODE, fields={"grade_id": [SCOPE_REFUSAL]}
            )

    if section_id is None:
        return

    placement = await repository.section_placement(connection, section_id)
    if placement is None:
        raise ApiError(
            422,
            "That section is not in the directory.",
            code=SCOPE_CODE,
            fields={"section_id": ["Unknown section."]},
        )
    if not placement["is_active"]:
        raise ApiError(
            422,
            "That section has been deactivated, so a learner cannot be placed in it.",
            code=SCOPE_CODE,
            fields={"section_id": ["This section is no longer active."]},
        )

    section_level = await repository.grade_level(connection, placement["grade_id"])
    if not is_mvp_level(section_level):
        raise ApiError(
            422,
            f"That section belongs to another grade. Only a Grade {MVP_GRADE_LEVEL} "
            "section can hold a learner.",
            code=SCOPE_CODE,
            fields={"section_id": [SCOPE_REFUSAL]},
        )


def _learner(row: Any) -> dict[str, Any]:
    return LearnerSummary(
        student_id=row["student_id"],
        user_id=row["user_id"],
        learner_id=row["learner_id"],
        full_name=row["full_name"],
        grade_id=row["grade_id"],
        section_id=row["section_id"],
        grade_name=row["grade_name"] if row["grade_name"] else None,
        section_name=row["section_name"] if row["section_name"] else None,
        school_name=row["school_name"] if row["school_name"] else None,
        monitoring_status=str(row["monitoring_status"]) if row["monitoring_status"] else None,
        diagnostic_status=str(row["diagnostic_status"]) if row["diagnostic_status"] else None,
        account_status=(
            str(row["account_status"])
            if row.get("account_status")
            else None
        ),
    ).model_dump(mode="json")


@router.get("/students/me")
async def read_own_learner_record(actor: CurrentActor, connection: ActorDb) -> dict[str, Any]:
    """The caller's own learner record."""
    row = await repository.own_learner(connection, actor.user_id)
    if row is None:
        raise ApiError(404, "No learner record belongs to this account")
    return {"data": _learner(row)}


@router.patch("/students/me")
async def update_own_profile(
    actor: CurrentActor, connection: ActorDb, body: OwnProfileChanges
) -> dict[str, Any]:
    """Change the caller's own display name.

    One field, because one column is what a learner may write on their own
    profile. Their role, their status and their learner id are not theirs to
    change, and the column grant says so even if this route were wrong.
    """
    updated = await repository.update_own_name(
        connection, user_id=actor.user_id, full_name=body.full_name
    )
    if updated is None:
        raise ApiError(404, "No profile belongs to this account")

    row = await repository.own_learner(connection, actor.user_id)
    if row is None:
        raise ApiError(404, "No learner record belongs to this account")
    return {"data": _learner(row)}


@router.get("/students")
async def list_learners(
    _actor: TeacherAdmin,
    connection: ActorDb,
    grade_id: Annotated[UUID | None, Query()] = None,
    section_id: Annotated[UUID | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = DEFAULT_PAGE_SIZE,
    status: Annotated[str, Query(pattern="^(enrolled|dropped|all)$")] = repository.STATUS_ENROLLED,
) -> dict[str, Any]:
    """The roster, school-wide, with the documented filters and pagination.

    `status` chooses which learners: `enrolled` by default, `dropped`, or
    `all`. A dropped learner has left the school, so keeping them on the
    default roster would mean a teacher clearing a graduating cohort watched
    the list stay exactly as long as before.

    The choice is applied in SQL, so the page, `total_items` and
    `meta.sections` are one question asked once rather than three answers that
    can disagree.

    `meta.sections` counts every section across the whole roster rather than
    the page that was returned, because that is the number a section-wide drop
    would act on.
    """
    offset = (page - 1) * page_size
    rows = await repository.roster(
        connection,
        grade_id=grade_id,
        section_id=section_id,
        limit=page_size,
        offset=offset,
        status=status,
    )
    total = await repository.roster_total(
        connection, grade_id=grade_id, section_id=section_id, status=status
    )
    counts = await repository.section_counts(connection, grade_id=grade_id)

    return {
        "data": [_learner(row) for row in rows],
        "meta": {
            "page": page,
            "page_size": page_size,
            "total_items": total,
            "total_pages": (total + page_size - 1) // page_size if page_size else 0,
            "status": status,
            "sections": [
                {
                    "section_id": str(row["section_id"]) if row["section_id"] else None,
                    "enrolled": row["enrolled"] or 0,
                    "dropped": row["dropped"] or 0,
                }
                for row in counts
            ],
        },
    }


@router.post("/students/drop")
async def drop_learners(
    _actor: TeacherAdmin,
    _session: SensitiveActor,
    connection: ActorDb,
    body: DropLearnersRequest,
) -> dict[str, Any]:
    """Drop learners from the school.

    Dropping archives: the account stops working on its very next request, the
    learner leaves the default roster, and every score, attempt and
    intervention recorded against them stays exactly where it is. That is not a
    shortfall but the only correct retirement this data model has — seven
    tables reference a learner's work and every one of those foreign keys is
    ON DELETE RESTRICT, because the class reporting a school keeps is built
    from them.

    Naming a section rather than a list of learners is the end-of-year case:
    the set is resolved here, from the section as it stands, so a paginated
    roster cannot cause a partial clear.

    A live session is required. Retiring a cohort is a school record.
    """
    if body.section_id is not None:
        placement = await repository.section_placement(connection, body.section_id)
        if placement is None:
            raise ApiError(404, "No section was found")
        rows = await repository.droppable_in_section(connection, body.section_id)
        refused: list[str] = []
    else:
        named = list(body.user_ids or [])
        rows = await repository.droppable_learners(connection, named)
        # An id that is not a learner's is refused by name rather than ignored:
        # silence here would let a request that named a Teacher/Administrator
        # read as a success that simply dropped nobody.
        known = {str(row["user_id"]) for row in await repository.known_learners(connection, named)}
        refused = [str(user_id) for user_id in named if str(user_id) not in known]
        if refused:
            raise ApiError(
                422,
                "Some of those accounts are not learners in this school.",
                code="not_a_learner",
                fields={"user_ids": refused},
            )

    targets = [row["user_id"] for row in rows]
    if not targets:
        # Nothing to do is a success, not a failure: a section whose learners
        # were already dropped is in the state that was asked for.
        return {"data": {"dropped": 0, "user_ids": []}}

    archived = await repository.archive_accounts(
        connection, user_ids=targets, request_id=current_request_id()
    )
    # Access and learning state are retired together. Leaving monitoring on
    # "active" is what would put "Active" and "Dropped" on the same roster row.
    await repository.retire_monitoring(connection, user_ids=targets)
    return {
        "data": {
            "dropped": len(archived),
            "user_ids": [str(row["user_id"]) for row in archived],
        }
    }


def get_provisioning(request: Request) -> StudentProvisioning:
    """The elevated provisioning service.

    Declared here rather than in the shared dependencies on purpose. This is the
    only route that may reach the secret key, and stating that in the module
    that owns the route keeps the reach visible.
    """
    elevated = request.app.state.elevated_database
    auth_admin = request.app.state.auth_admin
    if elevated is None or auth_admin is None:
        raise ApiError(503, "Account provisioning is not configured on this service")
    return StudentProvisioning(elevated, auth_admin)


Provisioning = Annotated[StudentProvisioning, Depends(get_provisioning)]


@router.post("/students", status_code=201)
async def enrol_learner(
    actor: TeacherAdmin,
    _session: SensitiveActor,
    connection: ActorDb,
    provisioning: Provisioning,
    body: EnrolLearnerRequest,
    response: Response,
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
) -> dict[str, Any]:
    """Provision and enrol a learner.

    Requires a Teacher/Administrator, a live session, and an `Idempotency-Key`,
    so a retried request returns the original result instead of creating a
    second account. The learner's role is set by the server and cannot be
    chosen by the request, and neither can a grade outside the one MathSmart
    teaches.
    """
    if not idempotency_key or len(idempotency_key) < MIN_IDEMPOTENCY_KEY_LENGTH:
        raise ApiError(
            400,
            "An Idempotency-Key header of at least 8 characters is required",
            code="idempotency_key_required",
        )

    # Checked before an account is provisioned, so a refused enrolment leaves
    # nothing behind to clean up.
    await _refuse_enrolment_outside_scope(connection, body.grade_id, body.section_id)

    try:
        learner, created = await provisioning.enrol(
            actor=actor,
            payload=body.model_dump(mode="json"),
            idempotency_key=idempotency_key,
            request_id=current_request_id(),
        )
    except IdempotencyMismatch as exc:
        raise ApiError(409, str(exc), code="idempotency_key_reused") from exc
    except ProvisioningConflict as exc:
        raise ApiError(409, str(exc), code="conflict") from exc
    except ProvisioningFailed as exc:
        raise ApiError(
            502, "The learner could not be enrolled", code="provisioning_failed"
        ) from exc

    # A replay is not a creation, and says so.
    response.status_code = 201 if created else 200
    return {
        "data": {
            "user_id": str(learner.user_id),
            "student_id": str(learner.student_id),
            "learner_id": learner.learner_id,
        }
    }


def get_purge(request: Request) -> StudentPurge:
    """The elevated purge service.

    Declared here rather than in the shared dependencies, exactly as the
    provisioning service is: these are the only two routes that may reach the
    secret key, and stating that in the module that owns them keeps the reach
    visible.
    """
    elevated = request.app.state.elevated_database
    auth_admin = request.app.state.auth_admin
    storage_admin = getattr(request.app.state, "storage_admin", None)
    if elevated is None or auth_admin is None:
        raise ApiError(503, "Permanent removal is not configured on this service")
    return StudentPurge(elevated, auth_admin, storage_admin)


Purging = Annotated[StudentPurge, Depends(get_purge)]

_PURGE_REFUSAL_STATUS = {
    "not_found": 404,
    "not_a_learner": 422,
    "not_dropped": 422,
    "confirmation_mismatch": 422,
    # Not the caller's fault and not retryable by them: the deployment is
    # missing the ledger this operation depends on.
    "purge_not_configured": 503,
}


@router.post("/students/{student_id}/restore")
async def restore_learner(
    _actor: TeacherAdmin,
    _session: SensitiveActor,
    connection: ActorDb,
    student_id: UUID,
    body: RestoreLearnerRequest,
) -> dict[str, Any]:
    """Put a dropped learner back on the roster.

    Restores three things and recalculates none: the account is made active
    again, monitoring resumes, and the learner is placed in the section the
    caller named. Every score, attempt, response, competency result, learning
    path item and intervention already recorded is left exactly as it is — this
    route never reads them, so it cannot change them.

    The destination is checked against the Grade 6 scope by the same guard that
    governs enrolment, so a restore cannot put a learner somewhere the
    curriculum does not reach, whatever the interface offered.
    """
    learner = await repository.restorable(connection, student_id)
    if learner is None:
        raise ApiError(404, "No learner record was found")
    if str(learner["role"]) != "student":
        raise ApiError(422, "Only a learner account can be restored.", code="not_a_learner")
    if str(learner["account_status"]) != "archived":
        raise ApiError(
            422, "This learner has not been dropped.", code="not_dropped"
        )

    await _refuse_enrolment_outside_scope(connection, None, body.section_id)

    placement = await repository.section_placement(connection, body.section_id)
    updated = await repository.restore_placement(
        connection,
        student_id=student_id,
        section_id=body.section_id,
        grade_id=placement["grade_id"],
    )
    if updated is None:
        raise ApiError(404, "No learner record was found")

    # The account last, so a failed placement leaves the learner dropped rather
    # than signed-in-but-unplaced.
    await repository.restore_account(
        connection, user_id=learner["user_id"], request_id=current_request_id()
    )

    row = await repository.learner(connection, student_id)
    if row is None:
        raise ApiError(404, "No learner record was found")
    return {"data": _learner(row)}


@router.get("/students/{student_id}/purge-preview")
async def preview_purge(
    _actor: TeacherAdmin, _session: SensitiveActor, purging: Purging, student_id: UUID
) -> dict[str, Any]:
    """What a permanent purge would remove, counted before anything is.

    Read so the confirmation can say what is actually about to be destroyed
    rather than a generic warning. Nothing is written by this route.
    """
    try:
        return {"data": await purging.preview(student_id)}
    except PurgeRefused as exc:
        raise ApiError(
            _PURGE_REFUSAL_STATUS.get(exc.code, 422), str(exc), code=exc.code
        ) from exc


@router.post("/students/{student_id}/purge")
async def purge_learner(
    actor: TeacherAdmin,
    _session: SensitiveActor,
    purging: Purging,
    student_id: UUID,
    body: PurgeLearnerRequest,
) -> dict[str, Any]:
    """Permanently remove one dropped learner.

    Irreversible, and deliberately hard to reach: a Teacher/Administrator, a
    live session, a learner who has already been dropped, and the learner id
    typed back. The learner being purged is the one the path names; the body
    only confirms it.

    Safe to repeat. The operation is recorded before the first deletion, so a
    retry resumes from where the last attempt stopped, and a purge that already
    finished answers with the same success rather than a confusing error.
    """
    try:
        outcome = await purging.purge(
            actor=actor,
            student_id=student_id,
            typed_learner_id=body.learner_id,
            request_id=current_request_id(),
        )
    except PurgeRefused as exc:
        raise ApiError(
            _PURGE_REFUSAL_STATUS.get(exc.code, 422), str(exc), code=exc.code
        ) from exc
    except PurgeFailed as exc:
        # The operation is recorded and resumable, and the message says so
        # without carrying any statement, identifier or exception text.
        raise ApiError(502, str(exc), code=exc.code) from exc

    return {
        "data": {
            "purged": outcome.purged,
            "already_purged": outcome.already_purged,
            "removed": outcome.removed,
        }
    }


@router.get("/students/{student_id}")
async def read_learner(
    _actor: TeacherAdmin, connection: ActorDb, student_id: UUID
) -> dict[str, Any]:
    """A named learner's record.

    A learner reads their own through `GET /students/me`; naming one is a
    Teacher/Administrator's action, and the policies refuse it a second time.
    """
    row = await repository.learner(connection, student_id)
    if row is None:
        raise ApiError(404, "No learner record was found")
    return {"data": _learner(row)}


@router.patch("/students/{student_id}")
async def update_learner(
    _actor: TeacherAdmin,
    _session: SensitiveActor,
    connection: ActorDb,
    student_id: UUID,
    body: LearnerRecordChanges,
) -> dict[str, Any]:
    """Change a learner's enrolment: their class, grade, school or monitoring.

    Not their identity and not their access. Moving a learner between classes is
    a security-critical school record, so it needs a live session too — and the
    class has to be one that exists inside the curriculum MathSmart teaches.
    """
    await _refuse_enrolment_outside_scope(connection, body.grade_id, body.section_id)

    updated = await repository.update_learner(
        connection,
        student_id=student_id,
        grade_id=body.grade_id,
        section_id=body.section_id,
        monitoring_status=body.monitoring_status,
        school_name=body.school_name,
    )
    if updated is None:
        raise ApiError(404, "No learner record was found")

    row = await repository.learner(connection, student_id)
    if row is None:
        raise ApiError(404, "No learner record was found")
    return {"data": _learner(row)}
