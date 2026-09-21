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
    updated_row = {**TEACHER_ROW, "full_name": "Maria C. Santos"}
    connection = auth_connection()
    connection.results[OWN_PROFILE] = updated_row
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
    assert data["full_name"] == "Maria C. Santos"



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


CANCEL = "app.cancel_own_email_change()"


def test_a_pending_email_change_is_withdrawn_as_the_caller():
    connection = auth_connection(**{CANCEL: True})
    client = build_client(connection)

    response = client.post("/api/v1/auth/me/email-change/cancel", headers=ADVISER_HEADERS)

    assert response.status_code == 200
    assert response.json() == {"data": {"cancelled": True}}
    # One statement, no arguments: there is no one else it could be aimed at.
    (args,) = [a for q, a in connection.calls if CANCEL in q]
    assert args == ()


def test_nothing_pending_is_answered_plainly():
    client = build_client(auth_connection(**{CANCEL: False}))

    response = client.post("/api/v1/auth/me/email-change/cancel", headers=ADVISER_HEADERS)

    assert response.json() == {"data": {"cancelled": False}}


def test_the_cancel_route_takes_no_body_that_names_a_user():
    client = build_client(auth_connection(**{CANCEL: True}))

    response = client.post(
        "/api/v1/auth/me/email-change/cancel",
        json={"user_id": "00000000-0000-4000-8000-000000000000"},
        headers=ADVISER_HEADERS,
    )

    # The body is ignored entirely; the caller's own change is the only one.
    assert response.status_code == 200


def test_signing_in_is_required_to_cancel():
    client = build_client(auth_connection())
    assert client.post("/api/v1/auth/me/email-change/cancel").status_code == 401
