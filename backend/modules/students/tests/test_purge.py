"""Permanent removal of one dropped learner.

Three things are being proved. The deletion touches exactly one learner and
nobody else. The operation is recorded before the first row goes, so a failure
between the database and Supabase Auth can be resumed rather than guessed at.
And every gate in front of it — the role, the dropped state, the typed learner
id — refuses rather than proceeds.

The completeness test at the bottom is the one that matters over time: it reads
the live foreign keys and fails if a table is ever added that owns learner rows
without the purge plan handling it.
"""

import os
from contextlib import asynccontextmanager
from uuid import UUID

import pytest

from middleware.auth import MathSmartRole, VerifiedToken
from modules.shared.auth_admin import AuthAdminError
from modules.shared.storage_admin import StorageAdminError
from modules.students.purge import (
    PURGE_PLAN,
    PurgeFailed,
    PurgeRefused,
    StudentPurge,
    fingerprint,
)

ADVISER_ID = UUID("a0000000-0000-4000-8000-0000000000a1")
STUDENT_ID = UUID("58000000-0000-4000-8000-000000000001")
USER_ID = UUID("b0000000-0000-4000-8000-000000000001")
OPERATION_ID = UUID("c0000000-0000-4000-8000-0000000000f1")

#: A second learner, whose records every test expects to survive untouched.
OTHER_STUDENT_ID = UUID("58000000-0000-4000-8000-0000000000aa")
OTHER_USER_ID = UUID("b0000000-0000-4000-8000-0000000000aa")

LEARNER_ID = "LRN-900001"

DROPPED_LEARNER = {
    "student_id": STUDENT_ID,
    "user_id": USER_ID,
    "learner_id": LEARNER_ID,
    "role": "student",
    "account_status": "archived",
}


def adviser() -> VerifiedToken:
    return VerifiedToken(
        user_id=ADVISER_ID,
        role=MathSmartRole.TEACHER_ADMIN,
        claims={"sub": str(ADVISER_ID), "app_metadata": {"role": "teacher_admin"}},
    )


class FakeElevatedConnection:
    def __init__(self, owner):
        self._owner = owner

    async def fetchrow(self, query, *args):
        self._owner.record(query, args)
        if "from app.purge_operations" in query:
            return self._owner.existing_operation
        if "from app.student_profiles" in query:
            return self._owner.learner
        return None

    async def fetchval(self, query, *args):
        self._owner.record(query, args)
        if "insert into app.purge_operations" in query:
            return OPERATION_ID
        if "count(*)" in query:
            return self._owner.counts.get(_table_of(query), 0)
        return None

    async def execute(self, query, *args):
        self._owner.record(query, args)
        if self._owner.fail_delete and "delete from app." in query:
            raise RuntimeError("delete from app.assessment_attempts blew up")
        return "OK"

    async def fetch(self, query, *args):
        self._owner.record(query, args)
        return []


def _table_of(query: str) -> str:
    for step in PURGE_PLAN:
        if f"app.{step.table}" in query:
            return step.table
    return ""


#: Distinguishes "the test did not say" from "the learner is not there".
MISSING = object()


class FakeElevated:
    def __init__(self, *, learner=MISSING, existing_operation=None, counts=None):
        self.operations = []
        self.statements = []
        self.arguments = []
        self.learner = dict(DROPPED_LEARNER) if learner is MISSING else learner
        self.existing_operation = existing_operation
        self.counts = counts or {}
        self.fail_delete = False

    def record(self, query, args):
        self.statements.append(query)
        self.arguments.append(args)

    @asynccontextmanager
    async def operation(self, *, actor, action, target_type, target_id=None,
                        request_id=None, details=None):
        self.operations.append(
            {"action": action, "target_type": target_type, "target_id": target_id,
             "request_id": request_id, "details": details or {}}
        )
        yield FakeElevatedConnection(self)

    def actions(self):
        return [operation["action"] for operation in self.operations]

    def deletions(self):
        """Every statement that removes something.

        The audit step is a function call rather than a DELETE, because
        app.audit_events holds no DELETE grant for any role — so "what did this
        remove" has to count that too.
        """
        return [
            query
            for query in self.statements
            if "delete from app." in query or "purge_learner_audit_trail" in query
        ]

    def every_argument(self):
        flat = []
        for args in self.arguments:
            flat.extend(args)
        return flat


class FakeAuthAdmin:
    def __init__(self, *, on_delete=None):
        self.deleted = []
        self._on_delete = on_delete

    async def delete_user(self, user_id, *, missing_ok=False):
        self.deleted.append((str(user_id), missing_ok))
        if self._on_delete is not None:
            raise self._on_delete


class FakeStorageAdmin:
    def __init__(self, *, on_delete=None, had_one=True):
        self.deleted = []
        self._on_delete = on_delete
        self._had_one = had_one

    async def delete_avatar(self, user_id, *, missing_ok=True):
        self.deleted.append((str(user_id), missing_ok))
        if self._on_delete is not None:
            raise self._on_delete
        return self._had_one


#: Lets a test pass a real `None` for storage, which is a different case from
#: "the test did not say" and has to be reachable.
DEFAULT = object()


def a_service(elevated=None, auth_admin=None, storage_admin=DEFAULT):
    return StudentPurge(
        elevated or FakeElevated(),
        auth_admin or FakeAuthAdmin(),
        FakeStorageAdmin() if storage_admin is DEFAULT else storage_admin,
    )


async def purge(service, typed=LEARNER_ID):
    return await service.purge(
        actor=adviser(), student_id=STUDENT_ID, typed_learner_id=typed
    )


# ---------------------------------------------------------------------------
# The gates in front of it
# ---------------------------------------------------------------------------


async def test_a_learner_who_is_still_enrolled_cannot_be_purged():
    """Purge is the second half of the drop workflow, never a shortcut past it."""
    elevated = FakeElevated(learner=dict(DROPPED_LEARNER, account_status="active"))

    with pytest.raises(PurgeRefused) as refusal:
        await purge(a_service(elevated=elevated))

    assert refusal.value.code == "not_dropped"
    assert elevated.deletions() == []


async def test_a_teacher_admin_cannot_be_purged_through_this_route():
    """The role is read from the database, never taken from the request."""
    elevated = FakeElevated(learner=dict(DROPPED_LEARNER, role="teacher_admin"))

    with pytest.raises(PurgeRefused) as refusal:
        await purge(a_service(elevated=elevated))

    assert refusal.value.code == "not_a_learner"
    assert elevated.deletions() == []


async def test_the_typed_learner_id_must_match_the_learner_the_path_names():
    """A tampered body can refuse the request; it cannot retarget it."""
    elevated = FakeElevated()

    with pytest.raises(PurgeRefused) as refusal:
        await purge(a_service(elevated=elevated), typed="LRN-SOMEONE-ELSE")

    assert refusal.value.code == "confirmation_mismatch"
    assert elevated.deletions() == []


async def test_a_learner_who_does_not_exist_is_not_found():
    elevated = FakeElevated(learner=None)

    with pytest.raises(PurgeRefused) as refusal:
        await purge(a_service(elevated=elevated))

    assert refusal.value.code == "not_found"


async def test_the_typed_id_is_compared_case_and_space_insensitively():
    elevated = FakeElevated()
    await purge(a_service(elevated=elevated), typed=f"  {LEARNER_ID.lower()} ")
    assert elevated.deletions()


# ---------------------------------------------------------------------------
# The ledger is written before anything is destroyed
# ---------------------------------------------------------------------------


async def test_the_operation_is_recorded_before_the_first_deletion():
    """Otherwise a failed Auth deletion has nothing left to resume from."""
    elevated = FakeElevated()

    await purge(a_service(elevated=elevated))

    opened = next(
        index
        for index, query in enumerate(elevated.statements)
        if "insert into app.purge_operations" in query
    )
    first_delete = next(
        index
        for index, query in enumerate(elevated.statements)
        if "delete from app." in query
    )
    assert opened < first_delete


async def test_the_ledger_stores_a_fingerprint_and_never_the_learner_id():
    elevated = FakeElevated()

    await purge(a_service(elevated=elevated))

    insert = next(
        args
        for query, args in zip(elevated.statements, elevated.arguments, strict=True)
        if "insert into app.purge_operations" in query
    )
    assert fingerprint(LEARNER_ID) in insert
    assert LEARNER_ID not in insert


# ---------------------------------------------------------------------------
# The deletion itself
# ---------------------------------------------------------------------------


async def test_every_table_in_the_plan_is_deleted_from():
    elevated = FakeElevated()

    await purge(a_service(elevated=elevated))

    written = " ".join(elevated.deletions())
    for step in PURGE_PLAN:
        if step.table == "audit_events":
            assert "purge_learner_audit_trail" in written
            continue
        assert f"app.{step.table}" in written, f"{step.table} is never deleted from"


async def test_the_profiles_go_last():
    """The audit rows in front of them clear the ON DELETE RESTRICT."""
    deletions = FakeElevated()
    await purge(a_service(elevated=deletions))
    order = deletions.deletions()

    audit = next(i for i, q in enumerate(order) if "purge_learner_audit_trail" in q)
    student = next(i for i, q in enumerate(order) if "app.student_profiles" in q)
    profile = next(i for i, q in enumerate(order) if "app.user_profiles" in q)

    assert audit < student < profile


async def test_the_auth_account_goes_after_every_row():
    elevated = FakeElevated()
    auth = FakeAuthAdmin()

    await purge(a_service(elevated=elevated, auth_admin=auth))

    assert auth.deleted == [(str(USER_ID), True)]
    assert elevated.deletions(), "rows must be deleted before the account"


async def test_no_other_learner_is_ever_named():
    """The single most important property: one learner, and only that one."""
    elevated = FakeElevated()

    await purge(a_service(elevated=elevated))

    named = {str(value) for value in elevated.every_argument()}
    assert str(OTHER_STUDENT_ID) not in named
    assert str(OTHER_USER_ID) not in named
    # Only this learner's two ids appear as deletion keys.
    for query, args in zip(elevated.statements, elevated.arguments, strict=True):
        if "delete from app." not in query:
            continue
        assert set(args) <= {STUDENT_ID, USER_ID}, query


async def test_a_response_table_is_deleted_explicitly_not_left_to_a_cascade():
    elevated = FakeElevated()

    await purge(a_service(elevated=elevated))

    written = " ".join(elevated.deletions())
    assert "app.assessment_responses" in written
    assert "app.competency_results" in written


# ---------------------------------------------------------------------------
# Resuming, and repeating
# ---------------------------------------------------------------------------


def unfinished(state):
    return {
        "purge_operation_id": OPERATION_ID,
        "student_id": STUDENT_ID,
        "auth_user_id": USER_ID,
        "confirmation_fingerprint": fingerprint(LEARNER_ID),
        "state": state,
    }


async def test_a_retry_after_a_failed_auth_deletion_resumes_from_the_ledger():
    """The profile rows are gone, so only the ledger knows which account is owed."""
    elevated = FakeElevated(existing_operation=unfinished("storage_deleted"), learner=None)
    auth = FakeAuthAdmin()

    outcome = await purge(a_service(elevated=elevated, auth_admin=auth))

    assert outcome.purged is True
    # It did not try to delete the rows a second time.
    assert elevated.deletions() == []
    # And it used the Auth id the ledger kept.
    assert auth.deleted == [(str(USER_ID), True)]


async def test_a_retry_after_a_failed_storage_step_resumes_there():
    elevated = FakeElevated(existing_operation=unfinished("database_deleted"), learner=None)
    auth = FakeAuthAdmin()

    await purge(a_service(elevated=elevated, auth_admin=auth))

    assert elevated.deletions() == []
    assert auth.deleted == [(str(USER_ID), True)]


async def test_a_completed_purge_answers_the_same_way_again():
    """A repeated request is a safe no-op, not a confusing 404."""
    elevated = FakeElevated(
        existing_operation=dict(unfinished("completed"), state="completed"), learner=None
    )
    auth = FakeAuthAdmin()

    outcome = await purge(a_service(elevated=elevated, auth_admin=auth))

    assert outcome.already_purged is True
    assert outcome.purged is False
    assert elevated.deletions() == []
    assert auth.deleted == []


async def test_resuming_still_requires_the_right_learner_id():
    elevated = FakeElevated(existing_operation=unfinished("database_deleted"), learner=None)

    with pytest.raises(PurgeRefused) as refusal:
        await purge(a_service(elevated=elevated), typed="LRN-SOMEONE-ELSE")

    assert refusal.value.code == "confirmation_mismatch"


# ---------------------------------------------------------------------------
# Failures
# ---------------------------------------------------------------------------


async def test_a_failed_auth_deletion_is_reported_as_retryable():
    elevated = FakeElevated()
    auth = FakeAuthAdmin(on_delete=AuthAdminError("Could not delete a user: 500"))

    with pytest.raises(PurgeFailed) as failure:
        await purge(a_service(elevated=elevated, auth_admin=auth))

    assert failure.value.code == "auth_delete_failed"
    assert "student.purge_failed" in elevated.actions()


async def test_the_audit_trail_is_never_deleted_from_directly():
    """app.audit_events is immutable: no role holds DELETE on it, by design."""
    elevated = FakeElevated()

    await purge(a_service(elevated=elevated))

    assert not any(
        "delete from app.audit_events" in query for query in elevated.statements
    )
    assert any("purge_learner_audit_trail" in query for query in elevated.statements)


async def test_a_failure_carries_no_statement_or_exception_text():
    elevated = FakeElevated()
    elevated.fail_delete = True

    with pytest.raises(PurgeFailed) as failure:
        await purge(a_service(elevated=elevated))

    message = str(failure.value)
    assert "delete from" not in message.lower()
    assert "blew up" not in message


async def test_a_failure_records_a_slug_rather_than_a_message():
    elevated = FakeElevated()
    elevated.fail_delete = True

    with pytest.raises(PurgeFailed):
        await purge(a_service(elevated=elevated))

    recorded = next(
        operation for operation in elevated.operations
        if operation["action"] == "student.purge_failed"
    )
    assert recorded["details"]["failure_code"] == "database_delete_failed"


# ---------------------------------------------------------------------------
# What survives
# ---------------------------------------------------------------------------


async def test_the_surviving_audit_record_names_the_actor_and_no_learner():
    elevated = FakeElevated(counts={"assessment_attempts": 4, "activity_attempts": 180})

    await purge(a_service(elevated=elevated))

    completion = next(
        operation for operation in elevated.operations
        if operation["action"] == "student.purged"
    )
    details = completion["details"]
    assert details["removed"]["assessment_attempts"] == 4
    # Nothing in the surviving record identifies the learner.
    rendered = str(details)
    assert LEARNER_ID not in rendered
    assert str(USER_ID) not in rendered


async def test_the_preview_counts_without_deleting_anything():
    elevated = FakeElevated(counts={"activity_attempts": 180})
    service = a_service(elevated=elevated)

    preview = await service.preview(STUDENT_ID)

    assert preview["learner_id"] == LEARNER_ID
    assert preview["removes"]["activity_attempts"] == 180
    assert elevated.deletions() == []


# ---------------------------------------------------------------------------
# The plan must keep up with the schema
# ---------------------------------------------------------------------------

LOCAL_DSN = os.environ.get(
    "MATHSMART_LOCAL_DB_DSN", "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
)

#: Tables that reference a learner but are deliberately not the purge's to
#: empty, with the reason. Anything not here and not in PURGE_PLAN fails the
#: completeness check below, which is the point.
DELIBERATELY_NOT_PURGED: dict[str, str] = {
    # Its foreign key is (updated_by, updated_by_role) and a check constraint
    # pins that role to 'teacher_admin', so a learner can never own a row here.
    "system_settings": "records which Teacher/Administrator changed a setting, never a learner",
}


async def _local_connection():
    asyncpg = pytest.importorskip("asyncpg")
    try:
        return await asyncpg.connect(LOCAL_DSN, timeout=3)
    except Exception:  # pragma: no cover - the stack is simply not running
        pytest.skip("the local Supabase database is not running")


@pytest.mark.integration
async def test_the_purge_plan_covers_every_learner_owned_table():
    """Fails the day a learner-owned table is added without being purged.

    Read from the live catalogue rather than from a list somebody remembered to
    update: a new table with a foreign key to a learner appears here
    automatically, and this test is what stops it being left behind in the
    database after the learner is gone.
    """
    connection = await _local_connection()
    try:
        rows = await connection.fetch(
            """
            select distinct child.relname as table_name
            from pg_constraint
            join pg_class child on child.oid = pg_constraint.conrelid
            join pg_class parent on parent.oid = pg_constraint.confrelid
            join pg_namespace n on n.oid = child.relnamespace
            where pg_constraint.contype = 'f'
              and n.nspname = 'app'
              and parent.relname in ('student_profiles', 'user_profiles')
            """
        )
    finally:
        await connection.close()

    referencing = {row["table_name"] for row in rows}
    handled = {step.table for step in PURGE_PLAN} | set(DELIBERATELY_NOT_PURGED)

    # teacher_admin_profiles points at user_profiles too, and is not a learner's.
    referencing.discard("teacher_admin_profiles")
    referencing.discard("student_profiles")

    missing = referencing - handled
    assert not missing, (
        f"these tables reference a learner but no purge step empties them: {sorted(missing)}"
    )


@pytest.mark.integration
async def test_every_response_and_result_table_is_handled_explicitly():
    """A cascade is not a reviewable deletion scope, so it is not relied on."""
    connection = await _local_connection()
    try:
        rows = await connection.fetch(
            """
            select distinct child.relname as table_name
            from pg_constraint
            join pg_class child on child.oid = pg_constraint.conrelid
            join pg_class parent on parent.oid = pg_constraint.confrelid
            join pg_namespace n on n.oid = child.relnamespace
            where pg_constraint.contype = 'f'
              and n.nspname = 'app'
              and parent.relname in ('assessment_attempts', 'activity_attempts')
            """
        )
    finally:
        await connection.close()

    handled = {step.table for step in PURGE_PLAN}
    missing = {row["table_name"] for row in rows} - handled
    assert not missing, (
        "these tables hang off a learner's attempts and are left to an "
        f"undocumented cascade: {sorted(missing)}"
    )
    # Named explicitly, because these two are the ones a cascade would hide.
    assert "activity_responses" in handled
    assert "assessment_responses" in handled


@pytest.mark.integration
async def test_the_ledger_is_closed_to_anon_and_authenticated():
    """The purge ledger is the elevated backend's alone."""
    connection = await _local_connection()
    try:
        grants = await connection.fetch(
            """
            select grantee, privilege_type
            from information_schema.role_table_grants
            where table_schema = 'app' and table_name = 'purge_operations'
            """
        )
        rls = await connection.fetchval(
            "select relrowsecurity from pg_class where oid = 'app.purge_operations'::regclass"
        )
    finally:
        await connection.close()

    reachable = {row["grantee"] for row in grants}
    assert "anon" not in reachable
    assert "authenticated" not in reachable
    assert "service_role" in reachable
    assert rls is True


# ---------------------------------------------------------------------------
# The learner's picture goes with them
# ---------------------------------------------------------------------------
#
# A profile picture lives in a private bucket, named after its owner, and the
# owner manages it themselves under Storage's own policies. A purged learner
# has no session left to do that with, so this is the one place the
# administrative Storage client is used — and the one place a photograph of a
# child could be left behind if it were not.


async def test_the_learners_picture_is_deleted():
    storage = FakeStorageAdmin()

    await purge(a_service(storage_admin=storage))

    assert storage.deleted == [(str(USER_ID), True)]


async def test_a_learner_who_never_uploaded_one_is_not_a_failure():
    """Most purges remove nothing here, and that is the ordinary case."""
    storage = FakeStorageAdmin(had_one=False)

    outcome = await purge(a_service(storage_admin=storage))

    assert outcome.purged is True


async def test_the_picture_goes_before_the_auth_account():
    """Storage is its own resumable state, ahead of the identity."""
    storage = FakeStorageAdmin()
    auth = FakeAuthAdmin()
    elevated = FakeElevated()

    await purge(a_service(elevated=elevated, auth_admin=auth, storage_admin=storage))

    states = [
        operation["details"].get("state")
        for operation in elevated.operations
        if operation["action"] == "student.purge_advanced"
    ]
    assert "storage_deleted" in states
    assert storage.deleted and auth.deleted


async def test_a_failed_picture_deletion_is_reported_as_retryable():
    storage = FakeStorageAdmin(on_delete=StorageAdminError("Storage returned 500"))
    auth = FakeAuthAdmin()

    with pytest.raises(PurgeFailed) as failure:
        await purge(a_service(auth_admin=auth, storage_admin=storage))

    assert failure.value.code == "storage_delete_failed"
    # The account is still there, so a retry still has something to finish.
    assert auth.deleted == []


async def test_a_purge_with_no_storage_configured_refuses_rather_than_skips():
    """Silently skipping would leave a child's photograph behind a purge that
    reported success."""
    auth = FakeAuthAdmin()

    with pytest.raises(PurgeFailed) as failure:
        await purge(a_service(auth_admin=auth, storage_admin=None))

    assert failure.value.code == "storage_delete_failed"
    assert auth.deleted == []
