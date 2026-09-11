"""Application wiring: who gets in, who is turned away, and in what shape."""

from contextlib import asynccontextmanager
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.config import Settings
from app.main import create_app
from middleware.auth import InvalidToken, JwksUnavailable, MathSmartRole, VerifiedToken
from middleware.request_context import REQUEST_ID_HEADER
from modules.shared.db import AccountDisabled

STUDENT = UUID("b0000000-0000-4000-8000-000000000001")
ADVISER = UUID("a0000000-0000-4000-8000-0000000000a1")
LIVE_SESSION = "3f6a1f8e-0000-4000-8000-000000000001"
REVOKED_SESSION = "3f6a1f8e-0000-4000-8000-0000000000ff"


def settings() -> Settings:
    return Settings(
        supabase_url="https://example.supabase.co",
        supabase_secret_key=SecretStr("sb_secret"),
        supabase_db_url=SecretStr("postgresql://u:p@127.0.0.1:5432/postgres"),
        supabase_jwks_url="https://example.supabase.co/auth/v1/.well-known/jwks.json",
        supabase_jwt_issuer="https://example.supabase.co/auth/v1",
    )


class FakeVerifier:
    """Maps a bearer token straight onto a role, so routing can be tested."""

    async def verify(self, token: str) -> VerifiedToken:
        if token == "student-token":
            return VerifiedToken(
                user_id=STUDENT,
                role=MathSmartRole.STUDENT,
                claims={"sub": str(STUDENT), "app_metadata": {"role": "student"}},
                session_id=LIVE_SESSION,
            )
        if token == "adviser-token":
            return VerifiedToken(
                user_id=ADVISER,
                role=MathSmartRole.TEACHER_ADMIN,
                claims={"sub": str(ADVISER), "app_metadata": {"role": "teacher_admin"}},
                session_id=LIVE_SESSION,
            )
        if token == "adviser-token-signed-out":
            return VerifiedToken(
                user_id=ADVISER,
                role=MathSmartRole.TEACHER_ADMIN,
                claims={"sub": str(ADVISER), "app_metadata": {"role": "teacher_admin"}},
                session_id=REVOKED_SESSION,
            )
        if token == "adviser-token-no-session":
            return VerifiedToken(
                user_id=ADVISER,
                role=MathSmartRole.TEACHER_ADMIN,
                claims={"sub": str(ADVISER), "app_metadata": {"role": "teacher_admin"}},
            )
        if token == "adviser-token-during-a-jwks-outage":
            # The signing keys could not be fetched, so nothing was learned
            # about this token either way.
            raise JwksUnavailable("The identity provider's keys could not be fetched")
        raise InvalidToken("The access token could not be verified")


class FakeConnection:
    async def fetch(self, query, *args):
        return []

    async def fetchrow(self, query, *args):
        return None

    async def fetchval(self, query, *args):
        return None

    async def execute(self, query, *args):
        return "OK"


class FakeDatabase:
    def __init__(self, *, account_active: bool = True):
        self.account_active = account_active

    async def connect(self, **_):
        return None

    async def disconnect(self):
        return None

    @asynccontextmanager
    async def actor(self, token):
        if not self.account_active:
            raise AccountDisabled("The account is not active")
        yield FakeConnection()


class FakeSessionGateway:
    """Only the live session identifier is recognised."""

    def __init__(self):
        self.asked = []

    async def connect(self, **_):
        return None

    async def disconnect(self):
        return None

    async def is_active(self, *, user_id, session_id):
        self.asked.append((user_id, session_id))
        return session_id == LIVE_SESSION


class FakeProvisioning:
    def __init__(self):
        self.calls = []

    async def enrol(self, *, actor, payload, idempotency_key, request_id=None):
        from modules.students.provisioning import ProvisionedLearner

        self.calls.append(payload)
        return (
            ProvisionedLearner(
                user_id=UUID("b0000000-0000-4000-8000-00000000000e"),
                student_id=UUID("58000000-0000-4000-8000-00000000000e"),
                learner_id=str(payload["learner_id"]).upper(),
            ),
            True,
        )


ENROLMENT = {
    "email": "new.learner@mathsmart.dev",
    "full_name": "New Learner",
    "learner_id": "LRN-900123",
    "grade_id": "3f0f0000-0000-4000-8000-000000000006",
}


def client_for(
    database: FakeDatabase | None = None,
    session_gateway: FakeSessionGateway | None = None,
    provisioning: FakeProvisioning | None = None,
) -> TestClient:
    app = create_app(
        settings=settings(),
        token_verifier=FakeVerifier(),
        database=database or FakeDatabase(),
        session_gateway=session_gateway or FakeSessionGateway(),
    )
    if provisioning is not None:
        from modules.students.router import get_provisioning

        app.dependency_overrides[get_provisioning] = lambda: provisioning
    return TestClient(app, raise_server_exceptions=False)


@pytest.fixture
def client() -> TestClient:
    return client_for()


def test_health_needs_no_token(client):
    response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json()["data"]["status"] == "ok"


def test_cors_allows_only_configured_origins():
    configured = settings().model_copy(
        update={
            "cors_allowed_origins": [
                "https://mathsmart.example",
                "http://localhost:3000",
            ]
        }
    )
    app = create_app(
        settings=configured,
        token_verifier=FakeVerifier(),
        database=FakeDatabase(),
        session_gateway=FakeSessionGateway(),
        elevated_database=FakeDatabase(),
    )

    with TestClient(app, raise_server_exceptions=False) as cors_client:
        allowed = cors_client.options(
            "/api/v1/health",
            headers={
                "Origin": "https://mathsmart.example",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "Authorization",
            },
        )
        denied = cors_client.options(
            "/api/v1/health",
            headers={
                "Origin": "https://attacker.example",
                "Access-Control-Request-Method": "GET",
            },
        )

    assert allowed.status_code == 200
    assert allowed.headers["access-control-allow-origin"] == "https://mathsmart.example"
    assert "access-control-allow-credentials" not in allowed.headers
    assert denied.status_code == 400
    assert "access-control-allow-origin" not in denied.headers


def test_a_request_without_a_token_is_unauthorized(client):
    response = client.get("/api/v1/auth/me")

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthorized"


def test_a_request_with_an_unverifiable_token_is_unauthorized(client):
    response = client.get("/api/v1/auth/me", headers={"Authorization": "Bearer nonsense"})

    assert response.status_code == 401


def test_an_identity_provider_outage_is_not_blamed_on_the_caller(client):
    """The token may be perfectly good; telling its holder to sign in again helps nobody."""
    response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": "Bearer adviser-token-during-a-jwks-outage"},
    )

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "identity_provider_unavailable"


def test_an_error_response_carries_the_request_id(client):
    response = client.get("/api/v1/auth/me")

    assert response.json()["error"]["request_id"] == response.headers[REQUEST_ID_HEADER]


def test_a_verified_learner_reaches_their_own_identity(client):
    response = client.get("/api/v1/auth/me", headers={"Authorization": "Bearer student-token"})

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["user_id"] == str(STUDENT)
    assert data["role"] == "student"


def test_a_verified_teacher_admin_is_identified_as_one(client):
    response = client.get("/api/v1/auth/me", headers={"Authorization": "Bearer adviser-token"})

    assert response.json()["data"]["role"] == "teacher_admin"


def test_an_inactive_account_is_refused_despite_a_valid_token():
    client = client_for(FakeDatabase(account_active=False))

    response = client.get(
        "/api/v1/students/me", headers={"Authorization": "Bearer student-token"}
    )

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "account_disabled"


def test_a_learner_cannot_reach_a_teacher_admin_route(client):
    response = client.get("/api/v1/students", headers={"Authorization": "Bearer student-token"})

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "forbidden"


def test_the_openapi_document_is_served(client):
    response = client.get("/api/v1/openapi.json")

    assert response.status_code == 200
    assert "/api/v1/auth/me" in response.json()["paths"]


# ---------------------------------------------------------------------------
# Sensitive operations also require a live session
# ---------------------------------------------------------------------------

SENSITIVE_HEADERS = {
    "Authorization": "Bearer adviser-token",
    "Idempotency-Key": "idem-00000001",
}


def test_a_sensitive_operation_succeeds_with_a_live_session():
    provisioning = FakeProvisioning()
    client = client_for(provisioning=provisioning)

    response = client.post("/api/v1/students", json=ENROLMENT, headers=SENSITIVE_HEADERS)

    assert response.status_code == 201
    assert provisioning.calls


def test_a_signed_out_session_cannot_perform_a_sensitive_operation():
    """The token has not expired. The session behind it is gone."""
    provisioning = FakeProvisioning()
    client = client_for(provisioning=provisioning)

    response = client.post(
        "/api/v1/students",
        json=ENROLMENT,
        headers={**SENSITIVE_HEADERS, "Authorization": "Bearer adviser-token-signed-out"},
    )

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "session_revoked"
    assert provisioning.calls == []


def test_a_token_without_a_session_claim_cannot_perform_a_sensitive_operation():
    provisioning = FakeProvisioning()
    client = client_for(provisioning=provisioning)

    response = client.post(
        "/api/v1/students",
        json=ENROLMENT,
        headers={**SENSITIVE_HEADERS, "Authorization": "Bearer adviser-token-no-session"},
    )

    assert response.status_code == 401
    assert provisioning.calls == []


def test_a_sensitive_operation_still_enforces_account_status():
    provisioning = FakeProvisioning()
    client = client_for(FakeDatabase(account_active=False), provisioning=provisioning)

    response = client.post("/api/v1/students", json=ENROLMENT, headers=SENSITIVE_HEADERS)

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "account_disabled"
    assert provisioning.calls == []


def test_a_learner_cannot_enrol_anybody():
    provisioning = FakeProvisioning()
    client = client_for(provisioning=provisioning)

    response = client.post(
        "/api/v1/students",
        json=ENROLMENT,
        headers={**SENSITIVE_HEADERS, "Authorization": "Bearer student-token"},
    )

    assert response.status_code == 403
    assert provisioning.calls == []


def test_enrolment_requires_an_idempotency_key():
    client = client_for(provisioning=FakeProvisioning())

    response = client.post(
        "/api/v1/students", json=ENROLMENT, headers={"Authorization": "Bearer adviser-token"}
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "idempotency_key_required"


def test_an_enrolment_request_cannot_choose_a_role():
    client = client_for(provisioning=FakeProvisioning())

    response = client.post(
        "/api/v1/students",
        json={**ENROLMENT, "role": "teacher_admin"},
        headers=SENSITIVE_HEADERS,
    )

    assert response.status_code == 422
    assert "role" in response.json()["error"]["fields"]
