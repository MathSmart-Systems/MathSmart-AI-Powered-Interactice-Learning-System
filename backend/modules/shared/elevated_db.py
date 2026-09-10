"""The elevated database path, deliberately kept apart from ordinary requests.

Almost nothing belongs here. Ordinary student and Teacher/Administrator requests
run through `modules.shared.db`, as the caller, under Row Level Security. This
module exists for the few operations that genuinely cannot: provisioning an
account before its profile exists, and writing the audit trail, which
`authenticated` is deliberately unable to insert into.

Three things make the separation real rather than a naming convention:

* Its own pool and its own module. A feature repository is handed an
  `ActorConnection` and has no route to this object at all.
* No entry point without a reason. `operation()` requires an action and a target
  type, so an elevated write cannot happen anonymously.
* Every operation is audited. A success is recorded in the same transaction as
  the change, so the two cannot disagree. A failure is recorded afterwards in
  its own transaction, because the one that failed has rolled back and taken any
  record inside it along.
"""

from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from typing import Any

import asyncpg
from pydantic import SecretStr

from middleware.auth import VerifiedToken

logger = logging.getLogger(__name__)

PG_ROLE_SERVICE = "service_role"
APPLICATION_SCHEMA = "app"

_ELEVATED_CONTEXT_SQL = (
    "select set_config('search_path', $1, true), set_config('role', $2, true)"
)

_AUDIT_INSERT_SQL = """
insert into app.audit_events
  (actor_user_id, actor_role, action, target_type, target_id, request_id, details)
values ($1, $2::app.user_role, $3, $4, $5, $6, $7::jsonb)
"""

#: Detail keys that must never reach the audit trail. An audit record is read by
#: people and retained for a long time; a temporary password or an email address
#: written into one is a leak that outlives the operation it describes.
_FORBIDDEN_DETAIL_FRAGMENTS = (
    "password",
    "secret",
    "token",
    "key",
    "credential",
    "email",
    "dsn",
)


class ElevatedOperationRefused(ValueError):
    """An elevated operation was attempted without saying what it was."""


def _is_forbidden(key: str) -> bool:
    lowered = key.lower()
    return any(fragment in lowered for fragment in _FORBIDDEN_DETAIL_FRAGMENTS)


def _redact_value(value: Any) -> Any:
    """Redact whatever a detail value turns out to be, at any depth.

    Sequences are walked as well as mappings: a forbidden key one list deep is
    still written verbatim into a row people read, which is the whole point of
    the deny list. A list of scalars comes back unchanged. Strings and bytes are
    sequences too and are deliberately left alone.
    """
    if isinstance(value, dict):
        return redact_details(value)
    if isinstance(value, list | tuple):
        return [_redact_value(item) for item in value]
    return value


def redact_details(details: dict[str, Any] | None) -> dict[str, Any]:
    """Drop credential-shaped and identifying keys, at any depth."""
    if not details:
        return {}
    redacted: dict[str, Any] = {}
    for key, value in details.items():
        if _is_forbidden(key):
            continue
        redacted[key] = _redact_value(value)
    return redacted


class ElevatedConnection:
    """A connection inside one audited elevated operation.

    The same narrow surface as `ActorConnection`: no nested transaction that
    could roll back past the context, and no close.
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


class ElevatedDatabase:
    """Audited, elevated access for the few operations that require it."""

    __slots__ = ("_dsn", "_pool")

    def __init__(self, dsn: SecretStr) -> None:
        self._dsn = dsn
        self._pool: Any | None = None

    async def connect(self, *, pool_factory: Callable[[str], Any] | None = None) -> None:
        if self._pool is not None:
            return
        factory = pool_factory or _elevated_pool_factory
        self._pool = await factory(self._dsn.get_secret_value())

    async def disconnect(self) -> None:
        if self._pool is None:
            return
        await self._pool.close()
        self._pool = None

    @asynccontextmanager
    async def operation(
        self,
        *,
        actor: VerifiedToken | None,
        action: str,
        target_type: str,
        target_id: str | None = None,
        request_id: str | None = None,
        details: dict[str, Any] | None = None,
    ) -> AsyncIterator[ElevatedConnection]:
        """One audited elevated operation.

        Args:
            actor: the verified caller who asked for this, or None for a
                system-initiated operation.
            action: a namespaced verb, for example `student.provisioned`.
            target_type: the kind of thing being changed.
        """
        if not action.strip():
            raise ElevatedOperationRefused("An elevated operation must name its action")
        if not target_type.strip():
            raise ElevatedOperationRefused("An elevated operation must name its target type")
        if self._pool is None:
            raise RuntimeError("The elevated database pool has not been created")

        safe_details = redact_details(details)

        try:
            async with self._pool.acquire() as connection:
                async with connection.transaction():
                    await connection.execute(
                        _ELEVATED_CONTEXT_SQL, APPLICATION_SCHEMA, PG_ROLE_SERVICE
                    )
                    yield ElevatedConnection(connection)
                    # Recorded inside the same transaction as the change, so a
                    # committed change always has its audit record and a rolled
                    # back one never does.
                    await _write_audit(
                        connection, actor, action, target_type, target_id, request_id, safe_details
                    )
        except Exception:
            # The transaction above has gone, and any record inside it with it.
            # The failure is recorded separately, and deliberately carries no
            # exception text: a message can contain a password or a DSN.
            logger.warning("Elevated operation %s failed", action, exc_info=False)
            await self._audit_failure(actor, action, target_type, target_id, request_id)
            raise

    async def _audit_failure(
        self,
        actor: VerifiedToken | None,
        action: str,
        target_type: str,
        target_id: str | None,
        request_id: str | None,
    ) -> None:
        failure_action = f"{action.split('.')[0]}.provisioning_failed" if "." in action else action
        try:
            async with self._pool.acquire() as connection:  # type: ignore[union-attr]
                async with connection.transaction():
                    await connection.execute(
                        _ELEVATED_CONTEXT_SQL, APPLICATION_SCHEMA, PG_ROLE_SERVICE
                    )
                    await _write_audit(
                        connection, actor, failure_action, target_type, target_id, request_id, {}
                    )
        except Exception:  # pragma: no cover - the audit must never mask the original error
            logger.error("Could not record the failure of elevated operation %s", action)


async def _write_audit(
    connection: Any,
    actor: VerifiedToken | None,
    action: str,
    target_type: str,
    target_id: str | None,
    request_id: str | None,
    details: dict[str, Any],
) -> None:
    await connection.execute(
        _AUDIT_INSERT_SQL,
        actor.user_id if actor else None,
        actor.role.value if actor else None,
        action,
        target_type,
        target_id,
        request_id,
        json.dumps(details, default=str),
    )


async def _elevated_pool_factory(dsn: str) -> Any:
    # Small on purpose. Elevated work is rare, and a large pool here would be a
    # standing invitation to route ordinary traffic through it.
    return await asyncpg.create_pool(dsn, min_size=1, max_size=2, statement_cache_size=0)
