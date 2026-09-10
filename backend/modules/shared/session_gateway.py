"""Is the session behind this token still alive?

An access token stays cryptographically valid until it expires, so signing out
does not retract one. Account status answers that for every request. This
gateway answers a narrower and stronger question for security-critical
mutations: does the session named by the token's `session_id` claim still exist,
and does it belong to the user the token identifies?

The surface is deliberately one question with a boolean answer.

* It never returns an `auth.sessions` row, or any part of one.
* It never hands out a connection, so no feature module can widen the query.
* It never logs the session identifier it was asked about. A session id is a
  bearer-adjacent value: written to a log it becomes a durable clue.
* When the answer cannot be obtained, it says no. A gateway that failed open
  would be worse than not having one, because it would look like protection.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any
from uuid import UUID

import asyncpg
from pydantic import SecretStr

logger = logging.getLogger(__name__)

#: Both halves matter. A live session belonging to somebody else is not a live
#: session for this caller.
_SESSION_EXISTS_SQL = """
select exists (
  select 1 from auth.sessions
  where sessions.id = $1 and sessions.user_id = $2
)
"""


class SessionGateway:
    """Confirms that a verified token's session has not been revoked."""

    __slots__ = ("_dsn", "_pool")

    def __init__(self, dsn: SecretStr) -> None:
        self._dsn = dsn
        self._pool: Any | None = None

    async def connect(self, *, pool_factory: Callable[[str], Any] | None = None) -> None:
        if self._pool is not None:
            return
        factory = pool_factory or _session_pool_factory
        self._pool = await factory(self._dsn.get_secret_value())

    async def disconnect(self) -> None:
        if self._pool is None:
            return
        await self._pool.close()
        self._pool = None

    async def is_active(self, *, user_id: UUID, session_id: str | None) -> bool:
        """True when this user's session still exists.

        A token with no session claim, or one whose claim is not a session
        identifier, is not treated as a live session.
        """
        if self._pool is None:
            raise RuntimeError("The session gateway has not been connected")

        if not session_id:
            return False
        try:
            session_uuid = UUID(str(session_id))
        except (TypeError, ValueError):
            return False

        try:
            async with self._pool.acquire() as connection:
                return bool(await connection.fetchval(_SESSION_EXISTS_SQL, session_uuid, user_id))
        except Exception:
            # No session identifier in the message: a log line is durable, and
            # this value is close enough to a credential to keep out of one.
            logger.warning("Could not confirm a session; denying the sensitive operation")
            return False


async def _session_pool_factory(dsn: str) -> Any:
    # Two connections. This gateway answers one small question on a small number
    # of routes, and a larger pool would only invite wider use.
    return await asyncpg.create_pool(dsn, min_size=1, max_size=2, statement_cache_size=0)
