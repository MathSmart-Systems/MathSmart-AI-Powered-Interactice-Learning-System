"""Token verification.

A valid token is authentication, not authorization. This module answers only
"who is calling, and which MathSmart role did the trusted claim grant" — and it
must refuse everything else, including a token that is merely well-formed.
"""

import threading
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from uuid import UUID

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from pydantic import SecretStr

from app.config import Settings
from middleware.auth import (
    InvalidToken,
    JwksUnavailable,
    MathSmartRole,
    RemoteJwks,
    TokenVerifier,
    parse_trusted_role,
)

ISSUER = "https://example.supabase.co/auth/v1"
AUDIENCE = "authenticated"
STUDENT_ID = "b0000000-0000-4000-8000-000000000001"

_private_key = ec.generate_private_key(ec.SECP256R1())
_other_private_key = ec.generate_private_key(ec.SECP256R1())
KID = "test-key-1"


def settings() -> Settings:
    return Settings(
        supabase_url="https://example.supabase.co",
        supabase_secret_key=SecretStr("sb_secret"),
        supabase_db_url=SecretStr("postgresql://u:p@127.0.0.1:5432/postgres"),
        supabase_jwks_url=f"{ISSUER}/.well-known/jwks.json",
        supabase_jwt_issuer=ISSUER,
        supabase_jwt_audience=AUDIENCE,
    )


class FakeJwks:
    """Serves one key, and counts refetches so cache-busting can be asserted."""

    def __init__(self, keys: dict[str, object] | None = None):
        self.keys = keys if keys is not None else {KID: _private_key.public_key()}
        self.fetches = 0

    async def public_key_for(self, kid: str):
        self.fetches += 1
        key = self.keys.get(kid)
        if key is None:
            raise KeyError(kid)
        return key


def make_token(*, key=None, kid=KID, algorithm="ES256", **claim_overrides) -> str:
    now = datetime.now(UTC)
    claims = {
        "iss": ISSUER,
        "aud": AUDIENCE,
        "sub": STUDENT_ID,
        "exp": now + timedelta(hours=1),
        "iat": now,
        "role": "authenticated",
        "session_id": "session-1",
        "app_metadata": {"role": "student"},
        "user_metadata": {},
    }
    claims.update(claim_overrides)
    return jwt.encode(claims, key or _private_key, algorithm=algorithm, headers={"kid": kid})


def verifier(jwks=None) -> TokenVerifier:
    return TokenVerifier(settings(), jwks=jwks or FakeJwks())


async def test_a_valid_token_identifies_the_caller():
    verified = await verifier().verify(make_token())

    assert verified.user_id == UUID(STUDENT_ID)
    assert verified.role is MathSmartRole.STUDENT
    assert verified.session_id == "session-1"


async def test_a_teacher_admin_claim_is_honoured():
    verified = await verifier().verify(make_token(app_metadata={"role": "teacher_admin"}))

    assert verified.role is MathSmartRole.TEACHER_ADMIN


async def test_a_token_from_another_issuer_is_refused():
    token = make_token(iss="https://attacker.example.com/auth/v1")

    with pytest.raises(InvalidToken):
        await verifier().verify(token)


async def test_a_token_for_another_audience_is_refused():
    with pytest.raises(InvalidToken):
        await verifier().verify(make_token(aud="some-other-service"))


async def test_an_expired_token_is_refused():
    past = datetime.now(UTC) - timedelta(hours=2)

    with pytest.raises(InvalidToken):
        await verifier().verify(make_token(exp=past, iat=past))


async def test_a_token_not_yet_valid_is_refused():
    future = datetime.now(UTC) + timedelta(hours=2)

    with pytest.raises(InvalidToken):
        await verifier().verify(make_token(nbf=future))


async def test_a_token_signed_by_another_key_is_refused():
    with pytest.raises(InvalidToken):
        await verifier().verify(make_token(key=_other_private_key))


async def test_an_unsigned_token_is_refused():
    claims = {"sub": STUDENT_ID, "iss": ISSUER, "aud": AUDIENCE}
    token = jwt.encode(claims, key=None, algorithm="none")

    with pytest.raises(InvalidToken):
        await verifier().verify(token)


async def test_a_symmetric_token_is_refused_even_with_a_matching_kid():
    """Algorithm confusion: the verifier must not accept HS256 for an EC key."""
    token = jwt.encode(
        {"iss": ISSUER, "aud": AUDIENCE, "sub": STUDENT_ID,
         "exp": datetime.now(UTC) + timedelta(hours=1)},
        key="a-shared-secret-long-enough-for-sha256",
        algorithm="HS256",
        headers={"kid": KID},
    )

    with pytest.raises(InvalidToken):
        await verifier().verify(token)


async def test_a_malformed_token_is_refused():
    with pytest.raises(InvalidToken):
        await verifier().verify("not-a-token")


async def test_a_token_without_a_subject_is_refused():
    with pytest.raises(InvalidToken):
        await verifier().verify(make_token(sub=None))


async def test_a_token_whose_subject_is_not_a_uuid_is_refused():
    with pytest.raises(InvalidToken):
        await verifier().verify(make_token(sub="not-a-uuid"))


async def test_a_token_with_no_recognised_role_is_refused():
    with pytest.raises(InvalidToken):
        await verifier().verify(make_token(app_metadata={}))


async def test_a_token_with_an_unknown_role_is_refused():
    with pytest.raises(InvalidToken):
        await verifier().verify(make_token(app_metadata={"role": "super_admin"}))


async def test_a_role_in_user_metadata_grants_nothing():
    token = make_token(app_metadata={"role": "student"}, user_metadata={"role": "teacher_admin"})

    verified = await verifier().verify(token)

    assert verified.role is MathSmartRole.STUDENT


async def test_only_user_metadata_grants_nothing_at_all():
    token = make_token(app_metadata={}, user_metadata={"role": "teacher_admin"})

    with pytest.raises(InvalidToken):
        await verifier().verify(token)


async def test_the_postgres_role_claim_is_not_a_mathsmart_role():
    """A token claiming the service_role Postgres role gets no MathSmart authority."""
    token = make_token(role="service_role", app_metadata={})

    with pytest.raises(InvalidToken):
        await verifier().verify(token)


async def test_an_unknown_key_id_is_refetched_once_then_refused():
    jwks = FakeJwks(keys={})

    with pytest.raises(InvalidToken):
        await verifier(jwks).verify(make_token(kid="rotated-key"))

    assert jwks.fetches == 1


class StubJwkClient:
    """Stands in for PyJWKClient, recording the thread its blocking call ran on."""

    def __init__(self, error: Exception | None = None):
        self.error = error
        self.thread: threading.Thread | None = None

    def get_signing_key(self, kid: str):
        self.thread = threading.current_thread()
        if self.error is not None:
            raise self.error
        return SimpleNamespace(key=_private_key.public_key())


def remote_jwks(client: StubJwkClient) -> RemoteJwks:
    remote = RemoteJwks(f"{ISSUER}/.well-known/jwks.json")
    remote._client = client
    return remote


async def test_the_blocking_jwks_fetch_does_not_run_on_the_event_loop():
    """A cold or stale cache means real HTTP, which must not stall the worker."""
    client = StubJwkClient()

    await remote_jwks(client).public_key_for(KID)

    assert client.thread is not threading.main_thread()


async def test_an_unreachable_jwks_endpoint_is_not_reported_as_a_bad_token():
    client = StubJwkClient(jwt.PyJWKClientConnectionError("the endpoint is unreachable"))

    with pytest.raises(JwksUnavailable):
        await remote_jwks(client).public_key_for(KID)


async def test_an_unknown_key_id_is_still_an_unknown_key():
    client = StubJwkClient(jwt.PyJWKClientError("no key matches that id"))

    with pytest.raises(KeyError):
        await remote_jwks(client).public_key_for(KID)


async def test_a_jwks_outage_reaches_the_caller_rather_than_becoming_an_invalid_token():
    """The token was never judged, so `verify` must not answer for it."""

    class UnreachableJwks:
        async def public_key_for(self, kid: str):
            raise JwksUnavailable("the endpoint is unreachable")

    with pytest.raises(JwksUnavailable):
        await verifier(UnreachableJwks()).verify(make_token())


def test_trusted_role_parsing_reads_app_metadata_only():
    assert parse_trusted_role({"app_metadata": {"role": "student"}}) is MathSmartRole.STUDENT
    assert parse_trusted_role({"user_metadata": {"role": "teacher_admin"}}) is None
    assert parse_trusted_role({"app_metadata": {"role": "root"}}) is None
    assert parse_trusted_role({"app_metadata": None}) is None
    assert parse_trusted_role({}) is None
