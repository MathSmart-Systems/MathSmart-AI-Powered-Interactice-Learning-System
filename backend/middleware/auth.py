"""Supabase access-token verification.

Tokens are verified locally against the project's JWKS endpoint using
asymmetric keys. The shared HS256 secret is not supported here on purpose: a
symmetric secret that can verify a token can also mint one, so a leak of it is
indistinguishable from a leak of every user's credentials.

Two rules govern everything below.

A valid token is authentication, not authorization. This module answers only
who is calling and which MathSmart role the trusted claim granted; whether that
caller may touch a particular row is decided later, by the service layer and by
Row Level Security.

The role comes from `app_metadata` and nowhere else. `user_metadata` is
editable by the user it describes, so a role found there grants nothing. The
`role` claim itself is a Postgres role — `authenticated`, `anon`,
`service_role` — and is never a MathSmart role.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from enum import StrEnum
from typing import Any, Protocol
from uuid import UUID

import jwt
from anyio import to_thread
from jwt import PyJWKClient

from app.config import Settings

logger = logging.getLogger(__name__)

#: Asymmetric only. Listing the accepted algorithms explicitly is what stops an
#: algorithm-confusion attack, where a token is signed HS256 using the public
#: key as the shared secret.
ACCEPTED_ALGORITHMS = ("ES256", "RS256")

#: Tolerance for clock drift between this process and the Auth server, matching
#: the reference implementation.
LEEWAY_SECONDS = 30

#: A ceiling on the JWKS fetch. Without one the client waits on the socket for
#: as long as the endpoint cares to hold it, and every request needing a key
#: waits with it.
JWKS_TIMEOUT_SECONDS = 5


class InvalidToken(Exception):
    """The token is absent, malformed, unverifiable, or grants no MathSmart role."""


class JwksUnavailable(Exception):
    """The signing keys could not be fetched, so the token was never judged.

    Distinct from `InvalidToken` because it says nothing about the token. It is
    ours to answer for, not the caller's.
    """


class MathSmartRole(StrEnum):
    """The only two production roles."""

    STUDENT = "student"
    TEACHER_ADMIN = "teacher_admin"


@dataclass(frozen=True)
class VerifiedToken:
    """A caller whose token verified, and the role their trusted claim granted."""

    user_id: UUID
    role: MathSmartRole
    claims: dict[str, Any]
    session_id: str | None = None


def parse_trusted_role(claims: dict[str, Any]) -> MathSmartRole | None:
    """The MathSmart role a set of verified claims grants, or None.

    Mirrors the frontend's `parseTrustedRole`: `app_metadata` only, exact match
    on the two production values, and no fallback for anything else.
    """
    app_metadata = claims.get("app_metadata")
    if not isinstance(app_metadata, dict):
        return None

    role = app_metadata.get("role")
    if role == MathSmartRole.STUDENT.value:
        return MathSmartRole.STUDENT
    if role == MathSmartRole.TEACHER_ADMIN.value:
        return MathSmartRole.TEACHER_ADMIN
    return None


class JwksProvider(Protocol):
    """Resolves a signing key id to its public key."""

    async def public_key_for(self, kid: str) -> Any: ...


class RemoteJwks:
    """The project's JWKS endpoint, cached.

    Cached because the endpoint is rate-limited and the keys rarely change, but
    never cached longer than the endpoint's own ten-minute cache: caching a
    revoked key for longer would keep accepting tokens the project has already
    disowned. An unknown key id busts the cache once, which is how a rotation is
    picked up without a restart.
    """

    def __init__(self, jwks_url: str) -> None:
        # `cache_keys` is deliberately left off. PyJWT implements it as an
        # unexpiring lru_cache around the per-kid lookup, which `lifespan` does
        # not reach — that bounds only the JWKS set beneath it — so a retired
        # signing key would keep verifying tokens until eviction or a restart.
        # The price of doing without it is one dictionary lookup per
        # verification, against a key that can actually be retired.
        self._client = PyJWKClient(
            jwks_url,
            lifespan=600,
            timeout=JWKS_TIMEOUT_SECONDS,
        )

    async def public_key_for(self, kid: str) -> Any:
        try:
            # Blocking HTTP whenever the set cache is cold, expired, or the kid
            # is unknown, so it belongs on a worker thread: on the event loop it
            # would stall every other request this process is serving.
            signing_key = await to_thread.run_sync(self._client.get_signing_key, kid)
        except jwt.PyJWKClientConnectionError as exc:
            # Before the generic handler: an endpoint we could not reach has
            # told us nothing about this key id, so it must not be reported as a
            # key id that does not exist.
            raise JwksUnavailable("The signing keys could not be fetched") from exc
        except jwt.PyJWKClientError as exc:
            raise KeyError(kid) from exc
        return signing_key.key


class TokenVerifier:
    """Verifies a Supabase access token and resolves the caller's MathSmart role."""

    def __init__(self, settings: Settings, *, jwks: JwksProvider | None = None) -> None:
        self._settings = settings
        self._jwks = jwks or RemoteJwks(settings.supabase_jwks_url)

    async def verify(self, token: str) -> VerifiedToken:
        if not token:
            raise InvalidToken("No access token was presented")

        try:
            header = jwt.get_unverified_header(token)
        except jwt.PyJWTError as exc:
            raise InvalidToken("The access token is malformed") from exc

        kid = header.get("kid")
        if not kid:
            raise InvalidToken("The access token names no signing key")

        try:
            public_key = await self._jwks.public_key_for(kid)
        except KeyError as exc:
            # The key id is unknown even after a refetch: either a rotation this
            # process has not seen, or a token this project did not issue.
            raise InvalidToken("The access token was signed by an unknown key") from exc

        try:
            claims = jwt.decode(
                token,
                key=public_key,
                algorithms=list(ACCEPTED_ALGORITHMS),
                issuer=self._settings.supabase_jwt_issuer,
                audience=self._settings.supabase_jwt_audience,
                leeway=LEEWAY_SECONDS,
                options={"require": ["exp", "iat", "sub", "aud", "iss"]},
            )
        except jwt.PyJWTError as exc:
            # Deliberately one message for every verification failure. Telling a
            # caller which check failed helps only the caller who is probing.
            raise InvalidToken("The access token could not be verified") from exc

        subject = claims.get("sub")
        try:
            user_id = UUID(str(subject))
        except (TypeError, ValueError) as exc:
            raise InvalidToken("The access token has no usable subject") from exc

        role = parse_trusted_role(claims)
        if role is None:
            raise InvalidToken("The access token grants no MathSmart role")

        session_id = claims.get("session_id")
        return VerifiedToken(
            user_id=user_id,
            role=role,
            claims=claims,
            session_id=str(session_id) if session_id is not None else None,
        )
