"""The session gateway.

A signed-out user still holds a valid token until it expires. For most requests
the account-status check is the right answer; for a security-critical mutation
it is worth also asking whether the session behind the token still exists.

The gateway answers exactly that, and nothing else. It returns a boolean. It
never returns an `auth.sessions` row, never exposes a connection, and never logs
the session identifier it was asked about.
"""

from uuid import UUID, uuid4

import pytest
from pydantic import SecretStr

from modules.shared.session_gateway import SessionGateway

USER = UUID("b0000000-0000-4000-8000-000000000001")
SESSION = "3f6a1f8e-0000-4000-8000-000000000001"


class FakeConnection:
    def __init__(self, log, result):
        self._log = log
        self._result = result

    async def fetchval(self, query, *args):
        self._log.append((query, args))
        return self._result


class FakeAcquire:
    def __init__(self, pool):
        self._pool = pool

    async def __aenter__(self):
        return self._pool.connection

    async def __aexit__(self, *exc):
        return False


class FakePool:
    def __init__(self, result):
        self.log = []
        self.connection = FakeConnection(self.log, result)

    def acquire(self):
        return FakeAcquire(self)

    async def close(self):
        self.log.append(("closed", ()))


async def a_gateway(result=True):
    pool = FakePool(result)
    gateway = SessionGateway(SecretStr("postgresql://u:p@127.0.0.1:5432/postgres"))

    async def factory(_dsn):
        return pool

    await gateway.connect(pool_factory=factory)
    return gateway, pool


async def test_a_live_session_is_accepted():
    gateway, _ = await a_gateway(result=True)

    assert await gateway.is_active(user_id=USER, session_id=SESSION) is True


async def test_a_removed_session_is_rejected():
    """The token has not expired. The session behind it is gone."""
    gateway, _ = await a_gateway(result=False)

    assert await gateway.is_active(user_id=USER, session_id=SESSION) is False


async def test_a_token_without_a_session_claim_is_rejected():
    gateway, pool = await a_gateway(result=True)

    assert await gateway.is_active(user_id=USER, session_id=None) is False
    assert pool.log == []


async def test_a_session_identifier_that_is_not_a_uuid_is_rejected():
    gateway, pool = await a_gateway(result=True)

    assert await gateway.is_active(user_id=USER, session_id="not-a-uuid") is False
    assert pool.log == []


async def test_the_session_must_belong_to_the_verified_user():
    """Both halves are in the query: someone else's live session is not yours."""
    gateway, pool = await a_gateway(result=True)

    await gateway.is_active(user_id=USER, session_id=SESSION)

    query, params = pool.log[0]
    assert "auth.sessions" in query
    assert USER in params
    assert UUID(SESSION) in params


async def test_only_a_boolean_leaves_the_gateway():
    gateway, _ = await a_gateway(result=True)

    result = await gateway.is_active(user_id=USER, session_id=SESSION)

    assert isinstance(result, bool)


async def test_the_gateway_exposes_no_connection_or_pool():
    gateway, _ = await a_gateway()

    assert not hasattr(gateway, "pool")
    assert not hasattr(gateway, "acquire")
    assert not hasattr(gateway, "fetch")
    assert not hasattr(gateway, "execute")


async def test_the_gateway_offers_nothing_but_the_question():
    public = {name for name in dir(SessionGateway) if not name.startswith("_")}

    assert public == {"connect", "disconnect", "is_active"}


async def test_an_unready_gateway_refuses_rather_than_guessing():
    gateway = SessionGateway(SecretStr("postgresql://u:p@127.0.0.1:5432/postgres"))

    with pytest.raises(RuntimeError):
        await gateway.is_active(user_id=USER, session_id=SESSION)


async def test_disconnecting_closes_the_pool():
    gateway, pool = await a_gateway()

    await gateway.disconnect()

    assert ("closed", ()) in pool.log


async def test_a_database_failure_denies_rather_than_admits():
    """If the answer cannot be obtained, the safe answer is no."""

    class ExplodingConnection:
        async def fetchval(self, query, *args):
            raise TimeoutError("the database is unreachable")

    class ExplodingPool:
        def acquire(self):
            class Acquire:
                async def __aenter__(self_inner):
                    return ExplodingConnection()

                async def __aexit__(self_inner, *exc):
                    return False

            return Acquire()

        async def close(self):
            return None

    gateway = SessionGateway(SecretStr("postgresql://u:p@127.0.0.1:5432/postgres"))

    async def factory(_dsn):
        return ExplodingPool()

    await gateway.connect(pool_factory=factory)

    assert await gateway.is_active(user_id=USER, session_id=str(uuid4())) is False
