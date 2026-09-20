"""Permanent removal of one dropped learner.

This is the second sanctioned elevated operation in the backend, and like
`provisioning.py` it lives in its own module so the reach of the secret key is
visible in the import graph rather than asserted in a comment.

Why the order is what it is
---------------------------
`app.audit_events.actor_user_id` references `app.user_profiles` ON DELETE
RESTRICT, and `app.record_audit_event` stamps the actor from `auth.uid()`, so a
learner who has submitted anything owns audit rows as the actor. Deleting the
Auth account first would cascade `auth.users -> app.user_profiles` and be
refused by that restriction. The application graph therefore goes first, and
the Auth identity last.

That ordering is what makes the ledger necessary. Once the profile rows are
committed away, nothing maps a `student_id` to an Auth `user_id` any more, so a
retry after a failed Auth deletion would have nothing to resume from. The
operation is recorded in `app.purge_operations` *before* the first deletion and
outlives every row it removes.

The sequence
------------
1. Resolve the operation: resume an unfinished one, answer a finished one, or
   validate the learner and open a new one.
2. Delete the approved record graph in one transaction.   -> database_deleted
3. Remove owned Storage objects.                          -> storage_deleted
4. Delete the Auth user. A 404 means somebody already did. -> completed

Every step is idempotent. Each deletion is `where <owner column> = $1`, so a
re-run removes nothing a second time, and each state is only advanced once the
step behind it has actually happened.

The learner cannot sign in at any point during this. Purge is refused unless
the account is already archived, and `app.is_active_account` refuses an
archived profile on every request — so a partially purged learner is no more
able to reach the system than a fully purged one. Deleting the Auth user ends
their ability to refresh; an already-issued access token stays valid until it
expires, which is exactly why the account-status check, not the token, is what
denies them.
"""

from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass
from typing import Any
from uuid import UUID

import asyncpg

from middleware.auth import VerifiedToken
from modules.shared.auth_admin import AuthAdminError, SupabaseAuthAdmin
from modules.shared.elevated_db import ElevatedDatabase

logger = logging.getLogger(__name__)

#: The role this service will remove. Read from the database and checked, never
#: taken from the request: this endpoint may not be used on a colleague.
PURGEABLE_ROLE = "student"

#: The account state a learner must already be in. Purge is not a shortcut
#: around the drop workflow; it is the second half of it.
REQUIRED_ACCOUNT_STATUS = "archived"


class PurgeRefused(Exception):
    """The request may not be carried out, and the caller should be told why."""

    def __init__(self, message: str, code: str) -> None:
        super().__init__(message)
        self.code = code


class PurgeFailed(Exception):
    """A step failed. The operation is recorded and can be retried."""

    def __init__(self, message: str, code: str) -> None:
        super().__init__(message)
        self.code = code


class PurgeNotConfigured(PurgeRefused):
    """The ledger this operation depends on is not present on this deployment.

    Raised rather than letting the driver error escape as an unhandled 500.
    A missing table is a deployment fact a person can act on, and saying so is
    far more use than "the request could not be completed" — while still
    naming no statement, no identifier and no exception text.
    """

    def __init__(self) -> None:
        super().__init__(
            "Permanent removal is not set up on this deployment yet. The purge ledger "
            "migration has not been applied to this database.",
            "purge_not_configured",
        )


@dataclass(frozen=True)
class PurgeStep:
    """One deletion in the approved graph.

    `table` is the table emptied of this learner and `column` the column that
    says the row is theirs. `owner` names which id that column holds:
    `"student"` and `"user"` are the learner's own ids, and an attempt table
    name means the rows are reached through that learner's attempts.

    Written out one per row rather than left to a cascade, because a cascade
    cannot be reviewed and silently grows every time somebody adds a table.
    """

    table: str
    column: str
    owner: str  # "student", "user", or the attempt table the rows hang off
    note: str


#: The approved deletion order, and the only statements this service will run.
#:
#: Read it top to bottom: children before parents, evidence before the profile
#: it belongs to, and the profile rows last so the audit deletion in front of
#: them has already cleared the ON DELETE RESTRICT that would otherwise refuse.
#:
#: `assessment_responses` and `competency_results` would be carried off by the
#: cascade from `assessment_attempts`, and are still named here on purpose. An
#: undocumented cascade is not a reviewable deletion scope, and a test asserts
#: this list against the live foreign keys so a table added later cannot slip
#: through unhandled.
PURGE_PLAN: tuple[PurgeStep, ...] = (
    PurgeStep(
        "assessment_responses",
        "attempt_id",
        "assessment_attempts",
        "One answer per question per assessment attempt.",
    ),
    PurgeStep(
        "competency_results",
        "attempt_id",
        "assessment_attempts",
        "Per-competency outcome of each assessment attempt.",
    ),
    PurgeStep("assessment_attempts", "student_id", "student", "Diagnostics and reassessments."),
    PurgeStep(
        "activity_responses",
        "attempt_id",
        "activity_attempts",
        "One answer per question per practice attempt.",
    ),
    PurgeStep("activity_attempts", "student_id", "student", "Retained practice attempts."),
    PurgeStep("competency_progress", "student_id", "student", "Current mastery per competency."),
    PurgeStep("student_module_progress", "student_id", "student", "Module completion."),
    PurgeStep("learning_path_items", "student_id", "student", "The personalised path."),
    PurgeStep(
        "reassessment_authorizations",
        "student_id",
        "student",
        "Authorisations to sit an assessment again.",
    ),
    PurgeStep("interventions", "student_id", "student", "Cases teachers opened and their notes."),
    PurgeStep("idempotency_keys", "user_id", "user", "Replay records naming this learner."),
    PurgeStep("audit_events", "actor_user_id", "user", "Events this learner was the actor of."),
    PurgeStep("student_profiles", "student_id", "student", "The learner record."),
    PurgeStep("user_profiles", "user_id", "user", "The account profile."),
)

#: The attempt tables whose children are reached through them rather than by a
#: learner column of their own. Named here so the completeness test has one
#: place to look.
ATTEMPT_PARENTS = ("assessment_attempts", "activity_attempts")

_LEARNER_SQL = """
select
  student_profiles.student_id,
  student_profiles.user_id,
  student_profiles.learner_id,
  user_profiles.role,
  user_profiles.account_status
from app.student_profiles
join app.user_profiles on user_profiles.user_id = student_profiles.user_id
where student_profiles.student_id = $1
"""

_FIND_OPERATION_SQL = """
select purge_operation_id, student_id, auth_user_id, confirmation_fingerprint, state
from app.purge_operations
where student_id = $1
order by created_at desc
limit 1
"""

_OPEN_OPERATION_SQL = """
insert into app.purge_operations
  (student_id, auth_user_id, requested_by, confirmation_fingerprint, state)
values ($1, $2, $3, $4, 'pending')
returning purge_operation_id
"""

_ADVANCE_SQL = """
update app.purge_operations
set state = $2::app.purge_state,
    failure_code = null,
    completed_at = case when $2 = 'completed' then now() else completed_at end
where purge_operation_id = $1
"""

_FAIL_SQL = """
update app.purge_operations
set failure_code = $2
where purge_operation_id = $1
"""

#: How many rows each table still holds for this learner. Shown in the
#: confirmation so a teacher sees what they are actually destroying, and
#: asserted afterwards to prove the graph is gone.
_COUNT_TEMPLATE = "select count(*) from app.{table} where {column} = $1"

_ATTEMPT_COUNT_TEMPLATE = """
select count(*) from app.{table}
where attempt_id in (select attempt_id from app.{parent} where student_id = $1)
"""

_DELETE_TEMPLATE = "delete from app.{table} where {column} = $1"

_DELETE_ATTEMPT_SCOPED_TEMPLATE = """
delete from app.{table}
where attempt_id in (select attempt_id from app.{parent} where student_id = $1)
"""

#: The idempotency rows that name this learner: the ones they own, plus the
#: enrolment replay a teacher wrote whose stored response points at them.
_DELETE_IDEMPOTENCY_SQL = """
delete from app.idempotency_keys
where user_id = $1
   or (response_body->>'user_id') = $1::text
"""

#: The learner's own audit trail, and the events recorded about their account.
#: What survives is the purge record itself, whose actor is the teacher.
#:
#: Run through a function rather than as a DELETE, because app.audit_events is
#: immutable by design: no role holds UPDATE or DELETE on it, not even
#: service_role, and that invariant is worth keeping. The function is the one
#: sanctioned exception — it can only remove one learner's records, and it
#: refuses any account that is not a learner.
_DELETE_AUDIT_SQL = "select app.purge_learner_audit_trail($1)"


def fingerprint(learner_id: str) -> str:
    """A stable hash of the learner id a teacher typed.

    Stored instead of the value so a retry can prove it means the same learner
    without the ledger holding an identifier of its own.
    """
    return hashlib.sha256(learner_id.strip().upper().encode()).hexdigest()


@dataclass(frozen=True)
class PurgeOutcome:
    purged: bool
    already_purged: bool
    operation_id: UUID
    removed: dict[str, int]


class StudentPurge:
    """Permanently removes one dropped learner, resumably."""

    def __init__(self, elevated: ElevatedDatabase, auth_admin: SupabaseAuthAdmin) -> None:
        self._elevated = elevated
        self._auth_admin = auth_admin

    # -- reading -----------------------------------------------------------

    async def preview(self, student_id: UUID) -> dict[str, Any]:
        """What a purge would remove, counted before anything is destroyed."""
        try:
            return await self._preview(student_id)
        except asyncpg.exceptions.UndefinedTableError as exc:
            raise PurgeNotConfigured() from exc

    async def _preview(self, student_id: UUID) -> dict[str, Any]:
        async with self._elevated.operation(
            actor=None,
            action="student.purge_previewed",
            target_type="student_profile",
            target_id=str(student_id),
        ) as connection:
            learner = await connection.fetchrow(_LEARNER_SQL, student_id)
            if learner is None:
                raise PurgeRefused("No learner record was found", "not_found")
            counts = await self._count(connection, learner["student_id"], learner["user_id"])

        return {
            "student_id": str(learner["student_id"]),
            "learner_id": learner["learner_id"],
            "account_status": str(learner["account_status"]),
            "removes": counts,
        }

    async def _count(self, connection: Any, student_id: UUID, user_id: UUID) -> dict[str, int]:
        counts: dict[str, int] = {}
        for step in PURGE_PLAN:
            if step.owner in ATTEMPT_PARENTS:
                query = _ATTEMPT_COUNT_TEMPLATE.format(table=step.table, parent=step.owner)
                counts[step.table] = await connection.fetchval(query, student_id) or 0
                continue
            key = student_id if step.owner == "student" else user_id
            query = _COUNT_TEMPLATE.format(table=step.table, column=step.column)
            counts[step.table] = await connection.fetchval(query, key) or 0
        return counts

    # -- purging -----------------------------------------------------------

    async def purge(
        self,
        *,
        actor: VerifiedToken,
        student_id: UUID,
        typed_learner_id: str,
        request_id: str | None = None,
    ) -> PurgeOutcome:
        """Purge a dropped learner, or resume a purge that did not finish."""
        typed = fingerprint(typed_learner_id)

        try:
            resolved = await self._resolve(actor, student_id, typed, request_id)
        except PurgeRefused:
            raise
        except asyncpg.exceptions.UndefinedTableError as exc:
            raise PurgeNotConfigured() from exc
        except Exception as exc:
            # Nothing has been deleted at this point: the ledger is opened
            # before the first deletion and this is that step failing.
            raise PurgeFailed(
                "The learner could not be removed. Nothing was deleted.", "purge_not_started"
            ) from exc
        if resolved.already_purged:
            return resolved

        operation_id = resolved.operation_id
        auth_user_id = UUID(str(resolved.removed.pop("__auth_user_id__")))
        state = str(resolved.removed.pop("__state__"))
        removed = resolved.removed

        if state == "pending":
            removed = await self._delete_graph(
                actor, operation_id, student_id, auth_user_id, request_id
            )
            state = "database_deleted"

        if state == "database_deleted":
            await self._delete_storage(operation_id, auth_user_id)
            state = "storage_deleted"

        if state == "storage_deleted":
            await self._delete_auth_user(operation_id, auth_user_id)
            state = "completed"

        await self._audit_completion(actor, operation_id, auth_user_id, removed, request_id)
        return PurgeOutcome(
            purged=True, already_purged=False, operation_id=operation_id, removed=removed
        )

    async def _resolve(
        self, actor: VerifiedToken, student_id: UUID, typed: str, request_id: str | None
    ) -> PurgeOutcome:
        """Find or open the operation this request belongs to.

        Three cases, and the order matters. A finished operation answers
        immediately, because the learner it describes no longer exists to be
        validated. An unfinished one is resumed, using the Auth id it recorded.
        Only a request with neither validates a learner and opens a new one.
        """
        async with self._elevated.operation(
            actor=actor,
            action="student.purge_opened",
            target_type="student_profile",
            target_id=str(student_id),
            request_id=request_id,
        ) as connection:
            existing = await connection.fetchrow(_FIND_OPERATION_SQL, student_id)

            if existing is not None and str(existing["state"]) == "completed":
                if existing["confirmation_fingerprint"] != typed:
                    raise PurgeRefused(
                        "That learner id does not match this learner.", "confirmation_mismatch"
                    )
                return PurgeOutcome(
                    purged=False,
                    already_purged=True,
                    operation_id=UUID(str(existing["purge_operation_id"])),
                    removed={},
                )

            if existing is not None:
                if existing["confirmation_fingerprint"] != typed:
                    raise PurgeRefused(
                        "That learner id does not match this learner.", "confirmation_mismatch"
                    )
                return PurgeOutcome(
                    purged=False,
                    already_purged=False,
                    operation_id=UUID(str(existing["purge_operation_id"])),
                    removed={
                        "__auth_user_id__": str(existing["auth_user_id"]),
                        "__state__": str(existing["state"]),
                    },
                )

            learner = await connection.fetchrow(_LEARNER_SQL, student_id)
            if learner is None:
                raise PurgeRefused("No learner record was found", "not_found")

            # Not a colleague. The role is read from the database rather than
            # taken from the request, so this endpoint cannot be pointed at a
            # Teacher/Administrator by a crafted body.
            if str(learner["role"]) != PURGEABLE_ROLE:
                raise PurgeRefused(
                    "Only a learner account can be purged.", "not_a_learner"
                )

            # Purge is the second half of the drop workflow, never a shortcut
            # around it.
            if str(learner["account_status"]) != REQUIRED_ACCOUNT_STATUS:
                raise PurgeRefused(
                    "Drop this student before purging them, so removing a learner is "
                    "always a second, separate decision.",
                    "not_dropped",
                )

            # The typed id is checked against the learner the path names, so a
            # tampered body can only cause a refusal, never a different target.
            if fingerprint(str(learner["learner_id"])) != typed:
                raise PurgeRefused(
                    "That learner id does not match this learner.", "confirmation_mismatch"
                )

            operation_id = await connection.fetchval(
                _OPEN_OPERATION_SQL,
                learner["student_id"],
                learner["user_id"],
                actor.user_id,
                typed,
            )

        return PurgeOutcome(
            purged=False,
            already_purged=False,
            operation_id=UUID(str(operation_id)),
            removed={
                "__auth_user_id__": str(learner["user_id"]),
                "__state__": "pending",
            },
        )

    async def _delete_graph(
        self,
        actor: VerifiedToken,
        operation_id: UUID,
        student_id: UUID,
        auth_user_id: UUID,
        request_id: str | None,
    ) -> dict[str, int]:
        """Delete the approved record graph, all of it or none of it."""
        removed: dict[str, int] = {}
        try:
            async with self._elevated.operation(
                actor=actor,
                action="student.purge_records_deleted",
                target_type="student_profile",
                target_id=str(student_id),
                request_id=request_id,
            ) as connection:
                counts = await self._count(connection, student_id, auth_user_id)

                for step in PURGE_PLAN:
                    if step.owner in ATTEMPT_PARENTS:
                        query = _DELETE_ATTEMPT_SCOPED_TEMPLATE.format(
                            table=step.table, parent=step.owner
                        )
                        await connection.execute(query, student_id)
                    elif step.table == "idempotency_keys":
                        await connection.execute(_DELETE_IDEMPOTENCY_SQL, auth_user_id)
                    elif step.table == "audit_events":
                        await connection.fetchval(_DELETE_AUDIT_SQL, auth_user_id)
                    else:
                        key = student_id if step.owner == "student" else auth_user_id
                        query = _DELETE_TEMPLATE.format(table=step.table, column=step.column)
                        await connection.execute(query, key)

                removed = counts
                await connection.execute(_ADVANCE_SQL, operation_id, "database_deleted")
        except PurgeRefused:
            raise
        except Exception:
            await self._record_failure(operation_id, "database_delete_failed")
            raise PurgeFailed(
                "The learner's records could not be removed.", "database_delete_failed"
            ) from None

        return removed

    async def _delete_storage(self, operation_id: UUID, auth_user_id: UUID) -> None:
        """Remove Storage objects this learner owns.

        This deployment defines no Storage bucket — no migration creates one and
        no client writes to one, and `user_profiles.avatar_url` is constrained
        to an external `https://` URL rather than an object path. So there is
        nothing to remove, and this step records that rather than pretending to
        work. It stays as its own state so that the day a bucket is introduced,
        the resumable sequence already has a place for it.
        """
        try:
            await self._remove_owned_objects(auth_user_id)
            await self._advance(operation_id, "storage_deleted")
        except Exception:
            await self._record_failure(operation_id, "storage_delete_failed")
            raise PurgeFailed(
                "The learner's stored files could not be removed.", "storage_delete_failed"
            ) from None

    async def _remove_owned_objects(self, auth_user_id: UUID) -> None:
        """Overridden where a bucket exists. A no-op is the honest answer here."""
        return None

    async def _delete_auth_user(self, operation_id: UUID, auth_user_id: UUID) -> None:
        """Remove the Auth identity and account.

        A 404 means somebody already removed it — a previous attempt that got
        further than its own bookkeeping, most likely — and that is success,
        not an error, or a retry could never finish.
        """
        try:
            await self._auth_admin.delete_user(auth_user_id, missing_ok=True)
        except AuthAdminError:
            await self._record_failure(operation_id, "auth_delete_failed")
            raise PurgeFailed(
                "The learner's records were removed, but their sign-in account could not "
                "be deleted. Try again to finish.",
                "auth_delete_failed",
            ) from None

        await self._advance(operation_id, "completed")

    # -- the ledger --------------------------------------------------------

    async def _advance(self, operation_id: UUID, state: str) -> None:
        async with self._elevated.operation(
            actor=None,
            action="student.purge_advanced",
            target_type="purge_operation",
            target_id=str(operation_id),
            details={"state": state},
        ) as connection:
            await connection.execute(_ADVANCE_SQL, operation_id, state)

    async def _record_failure(self, operation_id: UUID, code: str) -> None:
        """Record why a step stopped, as a slug and never as an error message."""
        try:
            async with self._elevated.operation(
                actor=None,
                action="student.purge_failed",
                target_type="purge_operation",
                target_id=str(operation_id),
                details={"failure_code": code},
            ) as connection:
                await connection.execute(_FAIL_SQL, operation_id, code)
        except Exception:
            # Never raised over the failure it describes: losing the original
            # cause would make the incident harder to understand.
            logger.error("Could not record the failure of a purge operation")

    async def _audit_completion(
        self,
        actor: VerifiedToken,
        operation_id: UUID,
        auth_user_id: UUID,
        removed: dict[str, int],
        request_id: str | None,
    ) -> None:
        """The one record that survives the learner.

        Enough to prove who did this and when, and nothing that identifies the
        learner to a reader: counts per table, the operation id, and the actor
        the elevated boundary stamps on every row it writes.
        """
        async with self._elevated.operation(
            actor=actor,
            action="student.purged",
            target_type="purge_operation",
            target_id=str(operation_id),
            request_id=request_id,
            details={"removed": removed},
        ):
            pass
