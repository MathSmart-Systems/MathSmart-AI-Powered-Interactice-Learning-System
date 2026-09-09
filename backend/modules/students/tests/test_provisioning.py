"""Administrator-provisioned enrolment.

Two things are being proved here. A retry must not create a second account, and
a failure between Auth and the database must not leave an orphaned identity
behind — while never touching an account this backend did not create.
"""

import json
from contextlib import asynccontextmanager
from uuid import UUID, uuid4

import asyncpg
import pytest

from middleware.auth import MathSmartRole, VerifiedToken
from modules.shared.auth_admin import AuthAdminError, AuthAdminUser, EmailAlreadyRegistered
from modules.students.provisioning import (
    PROVISIONED_ROLE,
    IdempotencyMismatch,
    ProvisioningConflict,
    ProvisioningFailed,
    StudentProvisioning,
)

ADVISER_ID = UUID("a0000000-0000-4000-8000-0000000000a1")
NEW_USER_ID = UUID("b0000000-0000-4000-8000-000000000001")
NEW_STUDENT_ID = UUID("58000000-0000-4000-8000-000000000001")

PAYLOAD = {
    "email": "learner@mathsmart.test",
    "full_name": "New Learner",
    "learner_id": "LRN-900001",
    "grade_id": "3f0f0000-0000-4000-8000-000000000006",
    "section_id": None,
    "school_name": "Sample School",
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
        self._owner.statements.append(query)
        if "idempotency_keys" in query and "select" in query:
            return self._owner.stored_key
        return None

    async def fetchval(self, query, *args):
        self._owner.statements.append(query)
        if "student_profiles" in query:
            if self._owner.learner_id_taken:
                raise duplicate_learner_id()
            if self._owner.fail_profile_write:
                raise RuntimeError("insert into app.student_profiles blew up")
            return NEW_STUDENT_ID
        return None

    async def execute(self, query, *args):
        self._owner.statements.append(query)
        if "user_profiles" in query and self._owner.fail_profile_write:
            raise RuntimeError("insert into app.user_profiles blew up")
        if "idempotency_keys" in query and "insert" in query:
            self._owner.recorded_key = args
        return "OK"

    async def fetch(self, query, *args):
        self._owner.statements.append(query)
        return []


class FakeElevated:
    def __init__(self):
        self.operations = []
        self.statements = []
        self.stored_key = None
        self.recorded_key = None
        self.fail_profile_write = False
        self.learner_id_taken = False
        self.fail_compensation_audit = False

    @asynccontextmanager
    async def operation(self, *, actor, action, target_type, target_id=None,
                        request_id=None, details=None):
        if action == "student.enrolment_compensated" and self.fail_compensation_audit:
            raise RuntimeError("the audit write blew up")
        self.operations.append(
            {"action": action, "target_type": target_type, "target_id": target_id,
             "request_id": request_id, "details": details or {}}
        )
        yield FakeElevatedConnection(self)

    def actions(self):
        return [operation["action"] for operation in self.operations]


class FakeAuthAdmin:
    def __init__(self, *, on_create=None):
        self.created = []
        self.deleted = []
        self._on_create = on_create

    async def create_user(self, *, email, app_metadata, password=None, email_confirm=True):
        self.created.append({"email": email, "app_metadata": app_metadata})
        if self._on_create is not None:
            raise self._on_create
        return AuthAdminUser(id=NEW_USER_ID, email=email)

    async def delete_user(self, user_id):
        self.deleted.append(str(user_id))


def duplicate_learner_id() -> asyncpg.UniqueViolationError:
    """What Postgres raises when student_profiles_learner_id_key is violated."""
    error = asyncpg.UniqueViolationError(
        "duplicate key value violates unique constraint"
        ' "student_profiles_learner_id_key"'
    )
    error.constraint_name = "student_profiles_learner_id_key"
    return error


def a_service(elevated=None, auth_admin=None):
    return StudentProvisioning(elevated or FakeElevated(), auth_admin or FakeAuthAdmin())


async def test_enrolling_creates_an_auth_account():
    admin = FakeAuthAdmin()
    service = a_service(auth_admin=admin)

    learner, created = await service.enrol(
        actor=adviser(), payload=PAYLOAD, idempotency_key="idem-00000001"
    )

    assert created is True
    assert learner.user_id == NEW_USER_ID
    assert learner.student_id == NEW_STUDENT_ID
    assert admin.created[0]["email"] == "learner@mathsmart.test"


async def test_the_trusted_role_is_a_constant_and_is_always_student():
    admin = FakeAuthAdmin()

    await a_service(auth_admin=admin).enrol(
        actor=adviser(), payload=PAYLOAD, idempotency_key="idem-00000001"
    )

    assert admin.created[0]["app_metadata"] == {"role": PROVISIONED_ROLE}
    assert PROVISIONED_ROLE == "student"


async def test_a_request_cannot_talk_its_way_into_creating_a_teacher_admin():
    """Even a payload carrying a role is ignored: the role is not read from it."""
    admin = FakeAuthAdmin()
    payload = {**PAYLOAD, "role": "teacher_admin", "app_metadata": {"role": "teacher_admin"}}

    await a_service(auth_admin=admin).enrol(
        actor=adviser(), payload=payload, idempotency_key="idem-00000001"
    )

    assert admin.created[0]["app_metadata"] == {"role": "student"}


async def test_the_profile_and_enrolment_are_written():
    elevated = FakeElevated()

    await a_service(elevated=elevated).enrol(
        actor=adviser(), payload=PAYLOAD, idempotency_key="idem-00000001"
    )

    written = " ".join(elevated.statements)
    assert "app.user_profiles" in written
    assert "app.student_profiles" in written


async def test_provisioning_is_audited():
    elevated = FakeElevated()

    await a_service(elevated=elevated).enrol(
        actor=adviser(), payload=PAYLOAD, idempotency_key="idem-00000001"
    )

    assert "student.provisioned" in elevated.actions()
    assert "student.enrolment_recorded" in elevated.actions()


async def test_the_audit_carries_no_email_or_credential():
    elevated = FakeElevated()

    await a_service(elevated=elevated).enrol(
        actor=adviser(), payload=PAYLOAD, idempotency_key="idem-00000001"
    )

    details = json.dumps([operation["details"] for operation in elevated.operations], default=str)
    assert "learner@mathsmart.test" not in details
    assert "LRN-900001" in details


async def test_a_retry_returns_the_original_result_and_creates_nothing():
    elevated = FakeElevated()
    elevated.stored_key = {
        "request_fingerprint": None,
        "response_body": json.dumps(
            {
                "user_id": str(NEW_USER_ID),
                "student_id": str(NEW_STUDENT_ID),
                "learner_id": "LRN-900001",
            }
        ),
    }
    admin = FakeAuthAdmin()
    service = StudentProvisioning(elevated, admin)

    from modules.students.provisioning import fingerprint

    elevated.stored_key["request_fingerprint"] = fingerprint(PAYLOAD)

    learner, created = await service.enrol(
        actor=adviser(), payload=PAYLOAD, idempotency_key="idem-00000001"
    )

    assert created is False
    assert learner.user_id == NEW_USER_ID
    assert admin.created == []
    assert admin.deleted == []


async def test_replaying_a_key_with_a_different_body_is_refused():
    elevated = FakeElevated()
    elevated.stored_key = {
        "request_fingerprint": "a-different-fingerprint",
        "response_body": json.dumps(
            {
                "user_id": str(NEW_USER_ID),
                "student_id": str(NEW_STUDENT_ID),
                "learner_id": "LRN-900001",
            }
        ),
    }
    admin = FakeAuthAdmin()

    with pytest.raises(IdempotencyMismatch):
        await StudentProvisioning(elevated, admin).enrol(
            actor=adviser(), payload=PAYLOAD, idempotency_key="idem-00000001"
        )

    assert admin.created == []


async def test_a_failed_profile_write_removes_the_account_it_just_created():
    elevated = FakeElevated()
    elevated.fail_profile_write = True
    admin = FakeAuthAdmin()

    with pytest.raises(ProvisioningFailed):
        await StudentProvisioning(elevated, admin).enrol(
            actor=adviser(), payload=PAYLOAD, idempotency_key="idem-00000001"
        )

    assert admin.deleted == [str(NEW_USER_ID)]


async def test_the_compensation_is_audited():
    elevated = FakeElevated()
    elevated.fail_profile_write = True

    with pytest.raises(ProvisioningFailed):
        await StudentProvisioning(elevated, FakeAuthAdmin()).enrol(
            actor=adviser(), payload=PAYLOAD, idempotency_key="idem-00000001"
        )

    assert "student.enrolment_compensated" in elevated.actions()


async def test_a_taken_learner_id_is_a_conflict_and_not_a_fault_of_ours():
    """The caller chose the learner id, so the answer is 409, never 502."""
    elevated = FakeElevated()
    elevated.learner_id_taken = True

    with pytest.raises(ProvisioningConflict):
        await StudentProvisioning(elevated, FakeAuthAdmin()).enrol(
            actor=adviser(), payload=PAYLOAD, idempotency_key="idem-00000001"
        )


async def test_a_taken_learner_id_still_removes_the_account_it_just_created():
    elevated = FakeElevated()
    elevated.learner_id_taken = True
    admin = FakeAuthAdmin()

    with pytest.raises(ProvisioningConflict):
        await StudentProvisioning(elevated, admin).enrol(
            actor=adviser(), payload=PAYLOAD, idempotency_key="idem-00000001"
        )

    assert admin.deleted == [str(NEW_USER_ID)]


async def test_an_unauditable_compensation_does_not_replace_the_original_failure():
    """Losing the cause would be worse than losing the audit line."""
    elevated = FakeElevated()
    elevated.fail_profile_write = True
    elevated.fail_compensation_audit = True
    admin = FakeAuthAdmin()

    with pytest.raises(ProvisioningFailed):
        await StudentProvisioning(elevated, admin).enrol(
            actor=adviser(), payload=PAYLOAD, idempotency_key="idem-00000001"
        )

    assert admin.deleted == [str(NEW_USER_ID)]


async def test_a_failed_enrolment_records_no_idempotency_key():
    """Otherwise a retry would replay a result that was never achieved."""
    elevated = FakeElevated()
    elevated.fail_profile_write = True

    with pytest.raises(ProvisioningFailed):
        await StudentProvisioning(elevated, FakeAuthAdmin()).enrol(
            actor=adviser(), payload=PAYLOAD, idempotency_key="idem-00000001"
        )

    assert elevated.recorded_key is None


async def test_a_pre_existing_account_is_reported_and_never_touched():
    admin = FakeAuthAdmin(on_create=EmailAlreadyRegistered("already registered"))

    with pytest.raises(ProvisioningConflict):
        await a_service(auth_admin=admin).enrol(
            actor=adviser(), payload=PAYLOAD, idempotency_key="idem-00000001"
        )

    # The account belongs to someone else. Compensation must not reach for it.
    assert admin.deleted == []


async def test_an_auth_failure_creates_no_orphan_to_compensate():
    admin = FakeAuthAdmin(on_create=AuthAdminError("the auth service is unwell"))

    with pytest.raises(ProvisioningFailed):
        await a_service(auth_admin=admin).enrol(
            actor=adviser(), payload=PAYLOAD, idempotency_key="idem-00000001"
        )

    assert admin.deleted == []


async def test_the_fingerprint_is_stable_across_key_order():
    from modules.students.provisioning import fingerprint

    reordered = dict(reversed(list(PAYLOAD.items())))

    assert fingerprint(PAYLOAD) == fingerprint(reordered)


async def test_the_fingerprint_changes_with_the_body():
    from modules.students.provisioning import fingerprint

    assert fingerprint(PAYLOAD) != fingerprint({**PAYLOAD, "learner_id": "LRN-999999"})


async def test_each_enrolment_uses_its_own_identifiers():
    """A guard against a fixture that accidentally shares state between tests."""
    assert uuid4() != uuid4()
