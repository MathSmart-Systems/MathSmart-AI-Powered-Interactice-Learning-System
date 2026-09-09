"""The transaction-local actor context that keeps Row Level Security in force.

The backend could reach the private `app` schema as an elevated role and be done
with it. It deliberately does not. An elevated role has `BYPASSRLS`, so every
policy written in Phases 1 to 5a would stop protecting anything the moment a
service-layer authorization check was incomplete — and the whole point of
defence in depth is that one missing check is survivable.

Instead each ordinary request installs the verified caller's claims and drops to
the `authenticated` Postgres role for the duration of one transaction, which is
exactly what PostgREST does per request. The database then answers as if the
learner had asked it directly, and the policies decide.

Three properties make this safe on a pooled connection:

* `set_config(name, value, is_local => true)` is the function form of
  `SET LOCAL`, which Postgres reverts at COMMIT or ROLLBACK. Actor context
  therefore cannot outlive its transaction and cannot leak to the next caller
  who checks out that connection.
* The role is a bind parameter, never string-built into the statement.
* The claims JSON is rewritten so its `role` is the role we resolved, not
  whatever the token asked for. A client cannot talk its way into `service_role`.

This module is pure: it builds a statement and its parameters and touches no
connection, so the exact wire format is unit-testable without a database.
"""

from __future__ import annotations

import json
from dataclasses import dataclass

from middleware.auth import VerifiedToken

#: The private application schema. Set transaction-locally so unqualified names
#: resolve inside it.
APPLICATION_SCHEMA = "app"

#: The only Postgres role an ordinary request ever runs as. A MathSmart role
#: (`student`, `teacher_admin`) is an application concept and is carried in the
#: claims; it is never a Postgres role.
PG_ROLE_AUTHENTICATED = "authenticated"

#: One statement, three transaction-local settings, all parameterised.
#:
#: Only the plural `request.jwt.claims` is set. `auth.uid()` consults the
#: singular `request.jwt.claim.sub` first and would silently take precedence
#: over the JSON, so that GUC is deliberately left alone.
_ACTOR_CONTEXT_SQL = (
    "select set_config('search_path', $1, true), "
    "set_config('role', $2, true), "
    "set_config('request.jwt.claims', $3, true)"
)


@dataclass(frozen=True)
class ActorContext:
    """The statement and parameters that install one caller's context."""

    sql: str
    params: tuple[str, str, str]


def build_actor_context(token: VerifiedToken | None) -> ActorContext:
    """Build the transaction-local context for a verified caller.

    Raises:
        ValueError: if there is no verified caller. There is no anonymous path
            into the application schema, so refusing here is the correct
            behaviour rather than falling back to a weaker role.
    """
    if token is None:
        raise ValueError("An actor context requires a verified token")

    claims = dict(token.claims)
    # The resolved role, not the requested one. auth.role() and any policy
    # reading auth.jwt() ->> 'role' see the JSON, while TO authenticated and
    # current_user see the GUC; both must come from this single decision.
    claims["role"] = PG_ROLE_AUTHENTICATED

    return ActorContext(
        sql=_ACTOR_CONTEXT_SQL,
        params=(
            APPLICATION_SCHEMA,
            PG_ROLE_AUTHENTICATED,
            json.dumps(claims, separators=(",", ":"), default=str),
        ),
    )
