"""Shared request dependencies.

What is deliberately absent matters as much as what is here. There is no
dependency that returns the elevated database or the Auth Admin client. Feature
code asking for "a connection" gets an actor-scoped one, under Row Level
Security, as the caller — there is nothing else on offer. The one sanctioned
elevated operation wires its own dependency inside its own module, so the reach
of the secret key is visible in the import graph rather than by convention.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends, Request

from middleware.auth import InvalidToken, MathSmartRole, VerifiedToken
from middleware.errors import ApiError
from modules.shared.db import AccountDisabled, ActorConnection

BEARER_PREFIX = "bearer "


def _bearer_token(request: Request) -> str:
    header = request.headers.get("Authorization", "")
    if not header.lower().startswith(BEARER_PREFIX):
        raise ApiError(401, "An access token is required")
    return header[len(BEARER_PREFIX) :].strip()


async def get_verified_token(request: Request) -> VerifiedToken:
    """The verified caller, or 401.

    Authentication only. Whether this caller may do the thing they asked for is
    decided by the route, the service, and the database policies.
    """
    token = _bearer_token(request)
    try:
        return await request.app.state.token_verifier.verify(token)
    except InvalidToken as exc:
        # One message for every verification failure; the detail is logged, not
        # returned, so a caller cannot probe which check they tripped.
        raise ApiError(401, "The access token is not valid") from exc


CurrentActor = Annotated[VerifiedToken, Depends(get_verified_token)]


async def get_actor_connection(
    request: Request, actor: CurrentActor
) -> AsyncIterator[ActorConnection]:
    """A transaction scoped to the caller, under Row Level Security.

    The account-status check lives inside this transaction, so a suspended or
    archived account is refused here rather than at sign-in — which is the only
    thing that works, because an access token stays valid until it expires.
    """
    try:
        async with request.app.state.database.actor(actor) as connection:
            yield connection
    except AccountDisabled as exc:
        raise ApiError(
            403,
            "This account is not active.",
            code="account_disabled",
        ) from exc


ActorDb = Annotated[ActorConnection, Depends(get_actor_connection)]


async def require_active_session(
    request: Request, actor: CurrentActor, _account: ActorDb
) -> VerifiedToken:
    """A live session, for security-critical operations.

    Every request already proves the account is active, which is what makes a
    suspension take effect immediately. This adds the stronger question for
    operations where a stolen or stale token would do real damage: is the
    session named by the token still there? Signing out removes the session but
    cannot retract the access token, so only this check notices.

    `_account` is the ordinary actor transaction. Depending on it keeps the
    authoritative account-status check in front of these routes too, including
    the ones that do their work elsewhere.
    """
    gateway = request.app.state.session_gateway
    if gateway is None:
        raise ApiError(503, "This operation is not available on this service")

    if not await gateway.is_active(user_id=actor.user_id, session_id=actor.session_id):
        # Deliberately says nothing about which part failed, and logs no
        # identifier: a session id is close enough to a credential.
        raise ApiError(
            401,
            "Sign in again to perform this action.",
            code="session_revoked",
        )
    return actor


SensitiveActor = Annotated[VerifiedToken, Depends(require_active_session)]


async def require_teacher_admin(actor: CurrentActor) -> VerifiedToken:
    """Refuse anyone who is not a Teacher/Administrator."""
    if actor.role is not MathSmartRole.TEACHER_ADMIN:
        raise ApiError(403, "This action requires a Teacher/Administrator")
    return actor


TeacherAdmin = Annotated[VerifiedToken, Depends(require_teacher_admin)]
