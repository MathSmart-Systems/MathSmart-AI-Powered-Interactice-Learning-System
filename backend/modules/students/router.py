"""Student routes.

`POST /students` is the only way a learner account comes into existence.
MathSmart accounts are administrator-provisioned; there is no public
registration, and the frozen route documentation's public register endpoint is
reported as a documentation mismatch rather than implemented.
"""

from __future__ import annotations

from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Header, Query, Request, Response

from app.dependencies import ActorDb, CurrentActor, TeacherAdmin
from middleware.errors import ApiError
from middleware.request_context import current_request_id
from modules.students import repository
from modules.students.provisioning import (
    IdempotencyMismatch,
    ProvisioningConflict,
    ProvisioningFailed,
    StudentProvisioning,
)
from modules.students.schemas import EnrolLearnerRequest, LearnerSummary

router = APIRouter(tags=["students"])

MAX_PAGE_SIZE = 100
DEFAULT_PAGE_SIZE = 20
MIN_IDEMPOTENCY_KEY_LENGTH = 8


def _learner(row: Any) -> dict[str, Any]:
    return LearnerSummary(
        student_id=row["student_id"],
        user_id=row["user_id"],
        learner_id=row["learner_id"],
        full_name=row["full_name"],
        grade_id=row["grade_id"],
        section_id=row["section_id"],
        monitoring_status=str(row["monitoring_status"]) if row["monitoring_status"] else None,
        diagnostic_status=str(row["diagnostic_status"]) if row["diagnostic_status"] else None,
    ).model_dump(mode="json")


@router.get("/students/me")
async def read_own_learner_record(actor: CurrentActor, connection: ActorDb) -> dict[str, Any]:
    """The caller's own learner record."""
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
) -> dict[str, Any]:
    """The roster, school-wide, with the documented filters and pagination."""
    offset = (page - 1) * page_size
    rows = await repository.roster(
        connection, grade_id=grade_id, section_id=section_id, limit=page_size, offset=offset
    )
    total = await repository.roster_total(connection, grade_id=grade_id, section_id=section_id)

    return {
        "data": [_learner(row) for row in rows],
        "meta": {
            "page": page,
            "page_size": page_size,
            "total_items": total,
            "total_pages": (total + page_size - 1) // page_size if page_size else 0,
        },
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


@router.post("/students", status_code=201)
async def enrol_learner(
    actor: TeacherAdmin,
    request: Request,
    body: EnrolLearnerRequest,
    response: Response,
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
) -> dict[str, Any]:
    """Provision and enrol a learner.

    Requires a Teacher/Administrator and an `Idempotency-Key`, so a retried
    request returns the original result instead of creating a second account.
    The learner's role is set by the server and cannot be chosen by the request.
    """
    if not idempotency_key or len(idempotency_key) < MIN_IDEMPOTENCY_KEY_LENGTH:
        raise ApiError(
            400,
            "An Idempotency-Key header of at least 8 characters is required",
            code="idempotency_key_required",
        )

    provisioning = get_provisioning(request)

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
