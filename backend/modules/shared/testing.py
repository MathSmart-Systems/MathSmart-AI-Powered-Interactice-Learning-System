"""Test support: a whole application without a database or a network.

Every feature module's route tests need the same three things — a verifier that
turns a bearer token into a role, a database that hands back rows the test chose,
and a session gateway that says yes. They live here so a module's tests can be
about that module.

What this deliberately does not do is stand in for Row Level Security. A fake
connection returns whatever the test gave it, so these tests prove routing,
authorization at the API boundary, and response shape. That a learner cannot
reach another learner's rows is proved against a real PostgreSQL, in the
integration tests, because only the database can prove it.
"""

from __future__ import annotations

from collections.abc import Iterable
from contextlib import asynccontextmanager
from typing import Any
from uuid import UUID

from pydantic import SecretStr

from app.config import Settings
from middleware.auth import InvalidToken, MathSmartRole, VerifiedToken

LEARNER = UUID("b0000000-0000-4000-8000-000000000001")
ADVISER = UUID("a0000000-0000-4000-8000-0000000000a1")
LIVE_SESSION = "3f6a1f8e-0000-4000-8000-000000000001"

#: Bearer tokens the fake verifier understands.
LEARNER_TOKEN = "student-token"  # noqa: S105 - a routing label, not a credential
ADVISER_TOKEN = "adviser-token"  # noqa: S105 - a routing label, not a credential

LEARNER_HEADERS = {"Authorization": f"Bearer {LEARNER_TOKEN}"}
ADVISER_HEADERS = {"Authorization": f"Bearer {ADVISER_TOKEN}"}


def fake_settings() -> Settings:
    """Settings with placeholder values, so nothing reads a real environment."""
    return Settings(
        supabase_url="https://example.supabase.co",
        supabase_secret_key=SecretStr("sb_secret"),
        supabase_db_url=SecretStr("postgresql://u:p@127.0.0.1:5432/postgres"),
        supabase_jwks_url="https://example.supabase.co/auth/v1/.well-known/jwks.json",
        supabase_jwt_issuer="https://example.supabase.co/auth/v1",
    )


def token_for(user_id: UUID, role: MathSmartRole) -> VerifiedToken:
    return VerifiedToken(
        user_id=user_id,
        role=role,
        claims={"sub": str(user_id), "app_metadata": {"role": role.value}},
        session_id=LIVE_SESSION,
    )


class FakeVerifier:
    """Maps a bearer token straight onto a role, so routing can be tested."""

    async def verify(self, token: str) -> VerifiedToken:
        if token == LEARNER_TOKEN:
            return token_for(LEARNER, MathSmartRole.STUDENT)
        if token == ADVISER_TOKEN:
            return token_for(ADVISER, MathSmartRole.TEACHER_ADMIN)
        raise InvalidToken("The access token could not be verified")


class FakeConnection:
    """Returns rows the test supplied, and records what it was asked."""

    def __init__(
        self,
        *,
        rows: Iterable[Any] = (),
        row: Any = None,
        value: Any = None,
        results: dict[str, Any] | None = None,
    ) -> None:
        self.rows = list(rows)
        self.row = row
        self.value = value
        # Keyed by a distinctive fragment of the query, for routes that run
        # more than one statement.
        self.results = results or {}
        self.calls: list[tuple[str, tuple[Any, ...]]] = []

    def _matched(self, query: str) -> Any:
        for fragment, result in self.results.items():
            if fragment in query:
                return result
        return None

    async def fetch(self, query: str, *args: Any) -> list[Any]:
        self.calls.append((query, args))
        matched = self._matched(query)
        return list(matched) if matched is not None else list(self.rows)

    async def fetchrow(self, query: str, *args: Any) -> Any:
        self.calls.append((query, args))
        matched = self._matched(query)
        return matched if matched is not None else self.row

    async def fetchval(self, query: str, *args: Any) -> Any:
        self.calls.append((query, args))
        matched = self._matched(query)
        return matched if matched is not None else self.value

    async def execute(self, query: str, *args: Any) -> str:
        self.calls.append((query, args))
        return "OK"

    def queries(self) -> list[str]:
        return [query for query, _ in self.calls]


class FakeDatabase:
    """Hands out one prepared connection, or refuses an inactive account."""

    def __init__(
        self, connection: FakeConnection | None = None, *, account_active: bool = True
    ) -> None:
        self.connection = connection or FakeConnection()
        self.account_active = account_active
        self.actors: list[VerifiedToken] = []

    async def connect(self, **_: Any) -> None:
        return None

    async def disconnect(self) -> None:
        return None

    @asynccontextmanager
    async def actor(self, token: VerifiedToken):
        from modules.shared.db import AccountDisabled

        if not self.account_active:
            raise AccountDisabled("The account is not active")
        self.actors.append(token)
        yield self.connection


class FakeSessionGateway:
    """Every session is live unless the test says otherwise."""

    def __init__(self, *, live: bool = True) -> None:
        self.live = live

    async def connect(self, **_: Any) -> None:
        return None

    async def disconnect(self) -> None:
        return None

    async def is_active(self, *, user_id: UUID, session_id: str | None) -> bool:
        return self.live


def build_client(
    connection: FakeConnection | None = None,
    *,
    account_active: bool = True,
    live_session: bool = True,
) -> Any:
    """A TestClient over the real application, with fakes underneath."""
    from fastapi.testclient import TestClient

    from app.main import create_app

    application = create_app(
        settings=fake_settings(),
        token_verifier=FakeVerifier(),
        database=FakeDatabase(connection, account_active=account_active),
        session_gateway=FakeSessionGateway(live=live_session),
    )
    return TestClient(application, raise_server_exceptions=False)
