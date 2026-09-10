"""The session gateway against a real `auth.sessions` table.

The unit tests fix the gateway's behaviour with a fake pool. These prove the
part a fake cannot: that the query names real columns in a real Supabase Auth
schema, and that removing a session — which is what signing out does — is
noticed even though the access token issued from it is still perfectly valid.

Requires a live PostgreSQL with the MathSmart migrations applied. Set
MATHSMART_TEST_DB_URL to run them; they are skipped otherwise.
"""

from __future__ import annotations

import os
from uuid import UUID, uuid4

import asyncpg
import pytest
from pydantic import SecretStr

from modules.shared.session_gateway import SessionGateway

DB_URL = os.environ.get("MATHSMART_TEST_DB_URL")

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(not DB_URL, reason="MATHSMART_TEST_DB_URL is not set"),
]

SIGNED_IN = uuid4()
SOMEBODY_ELSE = uuid4()
SUFFIX = uuid4().hex[:8].lower()


@pytest.fixture
async def sessions() -> dict[str, UUID]:
    """Two accounts, each holding one session."""
    owner = await asyncpg.connect(DB_URL, statement_cache_size=0)
    own_session = uuid4()
    other_session = uuid4()
    try:
        await owner.execute(
            "insert into auth.users (id, email) values ($1, $2), ($3, $4)",
            SIGNED_IN,
            f"session.one.{SUFFIX}@mathsmart.test",
            SOMEBODY_ELSE,
            f"session.two.{SUFFIX}@mathsmart.test",
        )
        await owner.execute(
            "insert into auth.sessions (id, user_id) values ($1, $2), ($3, $4)",
            own_session,
            SIGNED_IN,
            other_session,
            SOMEBODY_ELSE,
        )
        yield {"own": own_session, "other": other_session}
    finally:
        await owner.execute(
            "delete from auth.sessions where user_id = any($1::uuid[])",
            [SIGNED_IN, SOMEBODY_ELSE],
        )
        await owner.execute(
            "delete from auth.users where id = any($1::uuid[])", [SIGNED_IN, SOMEBODY_ELSE]
        )
        await owner.close()


@pytest.fixture
async def gateway() -> SessionGateway:
    gate = SessionGateway(SecretStr(DB_URL))
    await gate.connect()
    try:
        yield gate
    finally:
        await gate.disconnect()


async def test_a_session_that_exists_is_accepted(gateway, sessions):
    assert await gateway.is_active(user_id=SIGNED_IN, session_id=str(sessions["own"])) is True


async def test_signing_out_is_noticed_even_though_the_token_still_verifies(gateway, sessions):
    """Sign-out removes the session. It cannot retract the access token."""
    owner = await asyncpg.connect(DB_URL, statement_cache_size=0)
    try:
        await owner.execute("delete from auth.sessions where id = $1", sessions["own"])
    finally:
        await owner.close()

    assert await gateway.is_active(user_id=SIGNED_IN, session_id=str(sessions["own"])) is False


async def test_somebody_elses_live_session_is_not_yours(gateway, sessions):
    assert await gateway.is_active(user_id=SIGNED_IN, session_id=str(sessions["other"])) is False


async def test_a_session_that_never_existed_is_rejected(gateway, sessions):
    assert await gateway.is_active(user_id=SIGNED_IN, session_id=str(uuid4())) is False


async def test_a_token_with_no_session_claim_is_rejected(gateway, sessions):
    assert await gateway.is_active(user_id=SIGNED_IN, session_id=None) is False
