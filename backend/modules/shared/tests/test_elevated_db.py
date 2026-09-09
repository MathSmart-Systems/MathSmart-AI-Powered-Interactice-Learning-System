"""The elevated database path.

Ordinary requests never come through here. This is for the few operations that
genuinely cannot run as the caller — provisioning an account, and writing the
audit trail, which `authenticated` deliberately cannot insert into.

It has its own pool, its own module, and an API where every entry point must
name what it is doing and who asked, because an unaudited elevated write is
exactly what this project must not have.
"""

import json

import pytest
from pydantic import SecretStr

from middleware.auth import MathSmartRole, VerifiedToken
from modules.shared.elevated_db import (
    ElevatedConnection,
    ElevatedDatabase,
    ElevatedOperationRefused,
)

ADVISER = "a9000000-0000-4000-8000-0000000000a1"


def an_adviser() -> VerifiedToken:
    from uuid import UUID

    return VerifiedToken(
        user_id=UUID(ADVISER),
        role=MathSmartRole.TEACHER_ADMIN,
        claims={"sub": ADVISER, "app_metadata": {"role": "teacher_admin"}},
    )


class FakeTransaction:
    def __init__(self, log):
        self._log = log

    async def __aenter__(self):
        self._log.append(("begin",))
        return self

    async def __aexit__(self, exc_type, *_):
        self._log.append(("rollback",) if exc_type else ("commit",))
        return False


class FakeConnection:
    def __init__(self, log):
        self._log = log

    def transaction(self):
        return FakeTransaction(self._log)

    async def execute(self, query, *args):
        self._log.append(("execute", query, args))
        return "OK"

    async def fetch(self, query, *args):
        self._log.append(("fetch", query, args))
        return []

    async def fetchrow(self, query, *args):
        self._log.append(("fetchrow", query, args))
        return None

    async def fetchval(self, query, *args):
        self._log.append(("fetchval", query, args))
        return None


class FakeAcquire:
    def __init__(self, pool):
        self._pool = pool

    async def __aenter__(self):
        self._pool.log.append(("acquire",))
        return self._pool.connection

    async def __aexit__(self, *exc):
        self._pool.log.append(("release",))
        return False


class FakePool:
    def __init__(self):
        self.log = []
        self.connection = FakeConnection(self.log)

    def acquire(self):
        return FakeAcquire(self)

    async def close(self):
        self.log.append(("close",))


async def an_elevated_database():
    pool = FakePool()
    database = ElevatedDatabase(SecretStr("postgresql://u:p@127.0.0.1:5432/postgres"))

    async def factory(_dsn):
        return pool

    await database.connect(pool_factory=factory)
    return database, pool


def audit_inserts(log):
    return [entry for entry in log if entry[0] == "execute" and "audit_events" in entry[1]]


async def test_an_elevated_operation_runs_as_the_service_role():
    database, pool = await an_elevated_database()

    async with database.operation(
        actor=an_adviser(), action="student.provisioned", target_type="student_profile"
    ):
        pass

    role_statements = [
        entry for entry in pool.log if entry[0] == "execute" and "set_config" in entry[1]
    ]
    assert role_statements
    assert "service_role" in role_statements[0][2]


async def test_the_elevated_role_is_a_bind_parameter():
    database, pool = await an_elevated_database()

    async with database.operation(
        actor=an_adviser(), action="student.provisioned", target_type="student_profile"
    ):
        pass

    statement = next(e for e in pool.log if e[0] == "execute" and "set_config" in e[1])
    assert "service_role" not in statement[1]


async def test_a_successful_operation_is_audited_in_the_same_transaction():
    database, pool = await an_elevated_database()

    async with database.operation(
        actor=an_adviser(),
        action="student.provisioned",
        target_type="student_profile",
        target_id="58000000-0000-4000-8000-000000000001",
        request_id="req_abc",
    ):
        pass

    inserts = audit_inserts(pool.log)
    assert len(inserts) == 1
    params = inserts[0][2]
    assert ADVISER in [str(p) for p in params]
    assert "student.provisioned" in params
    assert "req_abc" in params

    kinds = [entry[0] for entry in pool.log]
    assert kinds.index("execute") < kinds.index("commit")


async def test_a_failed_operation_rolls_back_and_is_still_audited():
    database, pool = await an_elevated_database()

    with pytest.raises(RuntimeError):
        async with database.operation(
            actor=an_adviser(), action="student.provisioned", target_type="student_profile"
        ):
            raise RuntimeError("provisioning blew up")

    assert ("rollback",) in pool.log
    # The failure record cannot live in the transaction that rolled back, so it
    # is written afterwards in its own.
    inserts = audit_inserts(pool.log)
    assert len(inserts) == 1
    assert "student.provisioning_failed" in inserts[0][2]


async def test_the_failure_audit_does_not_carry_the_exception_text():
    """An exception message can carry a password, an answer key or a DSN."""
    database, pool = await an_elevated_database()

    with pytest.raises(RuntimeError):
        async with database.operation(
            actor=an_adviser(), action="student.provisioned", target_type="student_profile"
        ):
            raise RuntimeError("password=hunter2 dsn=postgresql://u:p@host/db")

    body = json.dumps([[str(part) for part in entry[2]] for entry in audit_inserts(pool.log)])
    assert "hunter2" not in body
    assert "postgresql://" not in body


async def test_audit_details_are_redacted():
    database, pool = await an_elevated_database()

    async with database.operation(
        actor=an_adviser(),
        action="student.provisioned",
        target_type="student_profile",
        details={"temporary_password": "hunter2", "learner_id": "LRN-1", "email": "a@b.test"},
    ):
        pass

    params = audit_inserts(pool.log)[0][2]
    recorded = json.dumps([str(p) for p in params])
    assert "hunter2" not in recorded
    assert "a@b.test" not in recorded
    assert "LRN-1" in recorded


async def test_an_operation_must_name_what_it_is_doing():
    database, _ = await an_elevated_database()

    with pytest.raises(ElevatedOperationRefused):
        async with database.operation(actor=an_adviser(), action="", target_type="student_profile"):
            pass


async def test_an_operation_must_name_a_target_type():
    database, _ = await an_elevated_database()

    with pytest.raises(ElevatedOperationRefused):
        async with database.operation(
            actor=an_adviser(), action="student.provisioned", target_type=""
        ):
            pass


async def test_the_elevated_connection_surface_is_narrow():
    database, _ = await an_elevated_database()

    async with database.operation(
        actor=an_adviser(), action="student.provisioned", target_type="student_profile"
    ) as connection:
        assert isinstance(connection, ElevatedConnection)
        assert not hasattr(connection, "transaction")
        assert not hasattr(connection, "close")


async def test_the_elevated_gateway_exposes_no_pool():
    database, _ = await an_elevated_database()

    assert not hasattr(database, "pool")
    assert not hasattr(database, "acquire")
