"""The database gateway.

Feature repositories must be unable to reach an unscoped connection, and the
actor context must be installed before any repository query can run. These
tests use a recording fake rather than a live database, so they pin the
ordering and the surface; the live behaviour is proved by the integration
tests in test_rls_enforcement.py.
"""

from uuid import UUID

import pytest
from pydantic import SecretStr

from middleware.auth import MathSmartRole, VerifiedToken
from modules.shared.actor_context import APPLICATION_SCHEMA, PG_ROLE_AUTHENTICATED
from modules.shared.db import ActorConnection, Database, DatabaseNotReady

STUDENT_UUID = UUID("b0000000-0000-4000-8000-000000000001")


def a_token() -> VerifiedToken:
    return VerifiedToken(
        user_id=STUDENT_UUID,
        role=MathSmartRole.STUDENT,
        claims={"sub": str(STUDENT_UUID), "app_metadata": {"role": "student"}},
    )


class FakeTransaction:
    def __init__(self, log):
        self._log = log

    async def __aenter__(self):
        self._log.append(("begin",))
        return self

    async def __aexit__(self, *exc):
        self._log.append(("end",))
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


async def a_database() -> tuple[Database, FakePool]:
    pool = FakePool()
    database = Database(SecretStr("postgresql://u:p@127.0.0.1:5432/postgres"))
    await database.connect(pool_factory=lambda dsn: _ready(pool))
    return database, pool


async def _ready(pool):
    return pool


async def test_an_actor_transaction_installs_the_context_before_anything_else():
    database, pool = await a_database()

    async with database.actor(a_token()) as connection:
        await connection.fetch("select 1")

    kinds = [entry[0] for entry in pool.log]
    assert kinds == ["acquire", "begin", "execute", "fetch", "end", "release"]


async def test_the_installed_context_carries_the_schema_role_and_claims():
    database, pool = await a_database()

    async with database.actor(a_token()):
        pass

    _, sql, params = next(entry for entry in pool.log if entry[0] == "execute")
    assert "set_config" in sql
    assert params[0] == APPLICATION_SCHEMA
    assert params[1] == PG_ROLE_AUTHENTICATED
    assert str(STUDENT_UUID) in params[2]


async def test_the_context_is_installed_inside_the_transaction_not_before_it():
    """Outside a transaction, set_config(..., true) evaporates silently."""
    database, pool = await a_database()

    async with database.actor(a_token()):
        pass

    kinds = [entry[0] for entry in pool.log]
    assert kinds.index("begin") < kinds.index("execute")


async def test_repositories_cannot_reach_the_raw_connection():
    database, _ = await a_database()

    async with database.actor(a_token()) as connection:
        assert isinstance(connection, ActorConnection)
        # No way to open a nested transaction, close the connection, or issue a
        # session-level SET that would outlive this request.
        assert not hasattr(connection, "transaction")
        assert not hasattr(connection, "close")
        assert not hasattr(connection, "set_type_codec")


async def test_the_gateway_exposes_no_pool_attribute_to_repositories():
    database, _ = await a_database()

    assert not hasattr(database, "pool")
    assert not hasattr(database, "acquire")


async def test_an_actor_transaction_requires_a_verified_caller():
    database, _ = await a_database()

    with pytest.raises(ValueError):
        async with database.actor(None):
            pass


async def test_using_the_database_before_it_is_connected_is_refused():
    database = Database(SecretStr("postgresql://u:p@127.0.0.1:5432/postgres"))

    with pytest.raises(DatabaseNotReady):
        async with database.actor(a_token()):
            pass


async def test_disconnecting_closes_the_pool():
    database, pool = await a_database()

    await database.disconnect()

    assert ("close",) in pool.log
