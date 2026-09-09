"""The database gateway feature modules are allowed to use.

There is exactly one way in: `Database.actor(token)`. It opens a transaction,
installs the verified caller's actor context, and yields a connection whose
surface is deliberately small. There is no property that returns the pool and no
method that hands out an unscoped connection, so a repository cannot
accidentally run a query with Row Level Security switched off — not because it
was told not to, but because it has no way to.

Elevated access lives in `modules.shared.elevated`, is never reachable from
here, and is audited at its own boundary.
"""

from __future__ import annotations

from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from typing import Any

import asyncpg
from pydantic import SecretStr

from middleware.auth import VerifiedToken
from modules.shared.actor_context import build_actor_context


class DatabaseNotReady(RuntimeError):
    """The gateway was used before its pool was created."""


class ActorConnection:
    """A connection already scoped to one caller, inside one transaction.

    Only the four query methods are exposed. `transaction` is absent so a
    repository cannot open a nested savepoint and roll back past the actor
    context; `close` is absent so it cannot return a half-configured connection
    to the pool; nothing is exposed that could issue a session-level `SET` that
    would outlive the request.
    """

    __slots__ = ("_connection",)

    def __init__(self, connection: Any) -> None:
        self._connection = connection

    async def fetch(self, query: str, *args: Any) -> list[Any]:
        return await self._connection.fetch(query, *args)

    async def fetchrow(self, query: str, *args: Any) -> Any:
        return await self._connection.fetchrow(query, *args)

    async def fetchval(self, query: str, *args: Any) -> Any:
        return await self._connection.fetchval(query, *args)

    async def execute(self, query: str, *args: Any) -> str:
        return await self._connection.execute(query, *args)


class Database:
    """Owns the connection pool. Hands out actor-scoped transactions only."""

    __slots__ = ("_dsn", "_pool")

    def __init__(self, dsn: SecretStr) -> None:
        self._dsn = dsn
        self._pool: Any | None = None

    async def connect(self, *, pool_factory: Callable[[str], Any] | None = None) -> None:
        """Create the pool.

        `statement_cache_size=0` because a Supavisor transaction-mode pooler
        does not support prepared statements; it costs little on a direct
        connection and removes a failure that only appears in one deployment
        shape.
        """
        if self._pool is not None:
            return

        factory = pool_factory or _default_pool_factory
        self._pool = await factory(self._dsn.get_secret_value())

    async def disconnect(self) -> None:
        if self._pool is None:
            return
        await self._pool.close()
        self._pool = None

    @asynccontextmanager
    async def actor(self, token: VerifiedToken | None) -> AsyncIterator[ActorConnection]:
        """A transaction that runs as the verified caller, under RLS.

        The context is installed as the first statement inside the transaction,
        which is what makes it transaction-local: outside a transaction,
        `set_config(..., true)` applies to an implicit single-statement
        transaction and is gone before the next query runs.
        """
        context = build_actor_context(token)

        if self._pool is None:
            raise DatabaseNotReady("The database pool has not been created")

        async with self._pool.acquire() as connection:
            async with connection.transaction():
                await connection.execute(context.sql, *context.params)
                yield ActorConnection(connection)


async def _default_pool_factory(dsn: str) -> Any:
    return await asyncpg.create_pool(
        dsn,
        min_size=1,
        max_size=10,
        statement_cache_size=0,
    )
