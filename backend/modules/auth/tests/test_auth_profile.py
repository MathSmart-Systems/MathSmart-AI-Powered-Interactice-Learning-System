"""Unit tests for /auth/me profile routes."""

from modules.shared.testing import (
    ADVISER,
    ADVISER_HEADERS,
    FakeConnection,
    build_client,
)

TEACHER_ROW = {
    "user_id": ADVISER,
    "full_name": "Maria Santos",
    "email": "teacher.maria@sanjose.deped.gov.ph",
    "role": "teacher_admin",
    "account_status": "active",
    "school_name": "San Jose Elementary School",
    "division_name": "DepEd Division of Rizal",
    "employee_id": "EMP-DEPED-2026",
}

OWN_PROFILE = "from app.user_profiles"
UPDATE_PROFILE = "update app.user_profiles"


def auth_connection(**overrides):
    results = {
        OWN_PROFILE: TEACHER_ROW,
        UPDATE_PROFILE: {"user_id": ADVISER},
    }
    results.update(overrides)
    return FakeConnection(results=results)


def test_auth_me_returns_profile_with_institutional_details():
    connection = auth_connection()
    client = build_client(connection)

    response = client.get("/api/v1/auth/me", headers=ADVISER_HEADERS)
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["user_id"] == str(ADVISER)
    assert data["role"] == "teacher_admin"
    assert data["full_name"] == "Maria Santos"
    assert data["email"] == "teacher.maria@sanjose.deped.gov.ph"
    assert data["school_name"] == "San Jose Elementary School"
    assert data["division_name"] == "DepEd Division of Rizal"


def test_auth_me_patches_caller_display_name():
    connection = auth_connection()
    client = build_client(connection)

    response = client.patch(
        "/api/v1/auth/me",
        json={"full_name": "Maria C. Santos"},
        headers=ADVISER_HEADERS,
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["user_id"] == str(ADVISER)
    assert data["role"] == "teacher_admin"


def test_auth_me_patch_rejects_empty_name():
    connection = auth_connection()
    client = build_client(connection)

    response = client.patch(
        "/api/v1/auth/me",
        json={"full_name": "   "},
        headers=ADVISER_HEADERS,
    )
    assert response.status_code == 422


def test_auth_me_patch_rejects_extra_forbidden_fields():
    connection = auth_connection()
    client = build_client(connection)

    response = client.patch(
        "/api/v1/auth/me",
        json={"full_name": "Maria Santos", "role": "admin"},
        headers=ADVISER_HEADERS,
    )
    assert response.status_code == 422
