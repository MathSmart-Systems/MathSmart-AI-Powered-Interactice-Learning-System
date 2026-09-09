"""Administrator-provisioned learner accounts.

This is the one sanctioned elevated operation in the backend, and it lives in
its own module so the reach of the secret key is visible in the import graph
rather than asserted in a comment. No shared dependency exposes what this file
imports.

The sequence, and why it is that way
------------------------------------
Creating a learner spans two systems: Supabase Auth owns the identity, the
application database owns the profile. There is no transaction across both, so
the order is chosen to make every failure recoverable.

1. A replay of the same Idempotency-Key returns the original response. A retry
   after a timeout must not produce a second account.
2. An account is created in Auth with the trusted role in `app_metadata`. The
   role is a constant here; it is never read from the request.
3. The profile and enrolment are written in one elevated, audited transaction.
4. If step 3 fails, the account created in step 2 is removed, because it is ours
   and it is now orphaned. An account that already existed is never touched —
   it is reported instead, and the caller decides.
"""

from __future__ import annotations

import hashlib
import json
import logging
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from middleware.auth import VerifiedToken
from modules.shared.auth_admin import AuthAdminError, EmailAlreadyRegistered, SupabaseAuthAdmin
from modules.shared.elevated_db import ElevatedDatabase

logger = logging.getLogger(__name__)

#: The role a provisioned learner receives. A constant, never a request field:
#: no request may choose to create a teacher_admin.
PROVISIONED_ROLE = "student"

ENDPOINT = "POST /students"


class ProvisioningConflict(Exception):
    """The email already belongs to an account, or the learner id is taken."""


class ProvisioningFailed(Exception):
    """Provisioning could not be completed. Any account created was removed."""


class IdempotencyMismatch(Exception):
    """The same key was replayed with a different request body."""


@dataclass(frozen=True)
class ProvisionedLearner:
    user_id: UUID
    student_id: UUID
    learner_id: str


def fingerprint(payload: dict[str, Any]) -> str:
    """A stable hash of the request, so a replayed key with a changed body is caught."""
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(canonical.encode()).hexdigest()


class StudentProvisioning:
    """Provisions a learner account on behalf of a Teacher/Administrator."""

    def __init__(self, elevated: ElevatedDatabase, auth_admin: SupabaseAuthAdmin) -> None:
        self._elevated = elevated
        self._auth_admin = auth_admin

    async def enrol(
        self,
        *,
        actor: VerifiedToken,
        payload: dict[str, Any],
        idempotency_key: str,
        request_id: str | None = None,
    ) -> tuple[ProvisionedLearner, bool]:
        """Enrol a learner. Returns the learner and whether this call created it."""
        request_fingerprint = fingerprint(payload)

        replayed = await self._replay(actor, idempotency_key, request_fingerprint, request_id)
        if replayed is not None:
            return replayed, False

        created = await self._create_auth_account(payload)

        try:
            learner = await self._write_profile(actor, created.id, payload, request_id)
        except Exception:
            # The Auth account is ours and is now orphaned, so it is removed.
            # A pre-existing account never reaches this path.
            await self._compensate(actor, created.id, request_id)
            raise ProvisioningFailed("The learner could not be enrolled") from None

        await self._remember(actor, idempotency_key, request_fingerprint, learner, request_id)
        return learner, True

    async def _replay(
        self,
        actor: VerifiedToken,
        idempotency_key: str,
        request_fingerprint: str,
        request_id: str | None,
    ) -> ProvisionedLearner | None:
        async with self._elevated.operation(
            actor=actor,
            action="student.enrolment_replay_checked",
            target_type="idempotency_key",
            request_id=request_id,
        ) as connection:
            row = await connection.fetchrow(
                """
                select request_fingerprint, response_body
                from app.idempotency_keys
                where user_id = $1 and endpoint = $2 and idempotency_key = $3
                """,
                actor.user_id,
                ENDPOINT,
                idempotency_key,
            )

        if row is None:
            return None
        if row["request_fingerprint"] != request_fingerprint:
            raise IdempotencyMismatch(
                "That idempotency key was already used with a different request"
            )
        stored = row["response_body"]
        if isinstance(stored, str):
            stored = json.loads(stored)
        return ProvisionedLearner(
            user_id=UUID(str(stored["user_id"])),
            student_id=UUID(str(stored["student_id"])),
            learner_id=str(stored["learner_id"]),
        )

    async def _create_auth_account(self, payload: dict[str, Any]) -> Any:
        try:
            return await self._auth_admin.create_user(
                email=str(payload["email"]),
                # A constant. The request has no say in this.
                app_metadata={"role": PROVISIONED_ROLE},
            )
        except EmailAlreadyRegistered as exc:
            raise ProvisioningConflict("That email address already belongs to an account") from exc
        except AuthAdminError as exc:
            raise ProvisioningFailed("The account could not be created") from exc

    async def _write_profile(
        self,
        actor: VerifiedToken,
        user_id: UUID,
        payload: dict[str, Any],
        request_id: str | None,
    ) -> ProvisionedLearner:
        async with self._elevated.operation(
            actor=actor,
            action="student.provisioned",
            target_type="student_profile",
            target_id=str(user_id),
            request_id=request_id,
            details={"learner_id": payload["learner_id"], "grade_id": str(payload["grade_id"])},
        ) as connection:
            await connection.execute(
                """
                insert into app.user_profiles (user_id, full_name, email, role)
                values ($1, $2, $3, 'student')
                """,
                user_id,
                payload["full_name"],
                str(payload["email"]).lower(),
            )
            student_id = await connection.fetchval(
                """
                insert into app.student_profiles
                  (user_id, learner_id, grade_id, section_id, school_name)
                values ($1, $2, $3, $4, $5)
                returning student_id
                """,
                user_id,
                str(payload["learner_id"]).upper(),
                payload["grade_id"],
                payload.get("section_id"),
                payload.get("school_name"),
            )

        return ProvisionedLearner(
            user_id=user_id,
            student_id=UUID(str(student_id)),
            learner_id=str(payload["learner_id"]).upper(),
        )

    async def _compensate(
        self, actor: VerifiedToken, user_id: UUID, request_id: str | None
    ) -> None:
        removed = True
        try:
            await self._auth_admin.delete_user(user_id)
        except AuthAdminError:
            # Reported, never raised over the original failure: losing the cause
            # would make the incident harder to understand than the orphan it
            # leaves behind.
            removed = False
            logger.error("Could not remove the orphaned Auth account for a failed enrolment")

        async with self._elevated.operation(
            actor=actor,
            action="student.enrolment_compensated",
            target_type="auth_user",
            target_id=str(user_id),
            request_id=request_id,
            details={"account_removed": removed},
        ):
            pass

    async def _remember(
        self,
        actor: VerifiedToken,
        idempotency_key: str,
        request_fingerprint: str,
        learner: ProvisionedLearner,
        request_id: str | None,
    ) -> None:
        body = json.dumps(
            {
                "user_id": str(learner.user_id),
                "student_id": str(learner.student_id),
                "learner_id": learner.learner_id,
            }
        )
        async with self._elevated.operation(
            actor=actor,
            action="student.enrolment_recorded",
            target_type="idempotency_key",
            target_id=str(learner.user_id),
            request_id=request_id,
        ) as connection:
            await connection.execute(
                """
                insert into app.idempotency_keys
                  (user_id, endpoint, idempotency_key, request_fingerprint,
                   response_status, response_body, completed_at)
                values ($1, $2, $3, $4, 201, $5::jsonb, now())
                """,
                actor.user_id,
                ENDPOINT,
                idempotency_key,
                request_fingerprint,
                body,
            )
