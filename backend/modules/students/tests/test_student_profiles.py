"""Learner profile routes.

`PATCH /students/me` updates the caller's own display name — the one column
`authenticated` may write on its own profile. Naming a learner is a
Teacher/Administrator's action, and the fields they may change are the school's
own: section, grade and monitoring status. Neither route can change a role, an
account status or a learner id.
"""

from uuid import UUID

from modules.shared.testing import (
    ADVISER_HEADERS,
    LEARNER,
    LEARNER_HEADERS,
    FakeConnection,
    build_client,
)

STUDENT_ID = UUID("58000000-0000-4000-8000-000000000001")
SECTION = UUID("cc7ef387-7435-4af0-8c50-0a7ce6aa5f5c")
GRADE = UUID("3f0f0000-0000-4000-8000-000000000006")

OWN_LEARNER = "where student_profiles.user_id = $1"
BY_STUDENT_ID = "where student_profiles.student_id = $1"
PROFILE_UPDATE = "update app.user_profiles"
LEARNER_UPDATE = "update app.student_profiles"

ROW = {
    "student_id": STUDENT_ID,
    "user_id": LEARNER,
    "learner_id": "STU-2026-001",
    "full_name": "Juan Dela Cruz",
    "grade_id": GRADE,
    "section_id": SECTION,
    "grade_name": "Grade 6",
    "section_name": "Rizal",
    "school_name": "San Jose Elementary School",
    "monitoring_status": "active",
    "diagnostic_status": "completed",
}


def student_connection(**overrides):
    results = {
        OWN_LEARNER: ROW,
        BY_STUDENT_ID: ROW,
        PROFILE_UPDATE: ROW,
        LEARNER_UPDATE: ROW,
    }
    results.update(overrides)
    return FakeConnection(results=results)


def test_a_learner_updates_their_own_display_name():
    connection = student_connection()
    client = build_client(connection)

    response = client.patch(
        "/api/v1/students/me", json={"full_name": "Juan D. Cruz"}, headers=LEARNER_HEADERS
    )

    assert response.status_code == 200
    _query, args = next(call for call in connection.calls if PROFILE_UPDATE in call[0])
    assert "Juan D. Cruz" in args
    assert LEARNER in args


def test_a_learner_reads_their_own_record_with_enrollment_names():
    connection = student_connection()
    client = build_client(connection)

    response = client.get("/api/v1/students/me", headers=LEARNER_HEADERS)

    assert response.status_code == 200
    record = response.json()["data"]
    assert record["learner_id"] == "STU-2026-001"
    assert record["grade_name"] == "Grade 6"
    assert record["section_name"] == "Rizal"
    assert record["school_name"] == "San Jose Elementary School"
    assert record["monitoring_status"] == "active"
    assert record["diagnostic_status"] == "completed"


def test_an_unassigned_learner_has_null_enrollment_names():
    unassigned = dict(ROW, grade_id=None, section_id=None, grade_name=None, section_name=None)
    client = build_client(student_connection(**{OWN_LEARNER: unassigned}))

    response = client.get("/api/v1/students/me", headers=LEARNER_HEADERS)

    assert response.status_code == 200
    record = response.json()["data"]
    assert record["grade_name"] is None
    assert record["section_name"] is None
    assert record["school_name"] == "San Jose Elementary School"


def test_a_learner_cannot_change_their_own_role_or_status():
    client = build_client(student_connection())

    for field, value in (("role", "teacher_admin"), ("account_status", "active")):
        response = client.patch(
            "/api/v1/students/me", json={field: value}, headers=LEARNER_HEADERS
        )
        assert response.status_code == 422
        assert field in response.json()["error"]["fields"]


def test_a_learner_cannot_change_their_own_learner_id():
    client = build_client(student_connection())

    response = client.patch(
        "/api/v1/students/me", json={"learner_id": "STU-9999"}, headers=LEARNER_HEADERS
    )

    assert response.status_code == 422


def test_a_teacher_admin_reads_a_named_learner():
    client = build_client(student_connection())

    response = client.get(f"/api/v1/students/{STUDENT_ID}", headers=ADVISER_HEADERS)

    assert response.status_code == 200
    assert response.json()["data"]["learner_id"] == "STU-2026-001"


def test_a_learner_cannot_read_another_learner_by_id():
    connection = student_connection()
    client = build_client(connection)

    response = client.get(f"/api/v1/students/{STUDENT_ID}", headers=LEARNER_HEADERS)

    assert response.status_code == 403


def test_a_teacher_admin_moves_a_learner_between_sections():
    connection = student_connection()
    client = build_client(connection)

    response = client.patch(
        f"/api/v1/students/{STUDENT_ID}",
        json={"section_id": str(SECTION), "monitoring_status": "improving"},
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 200
    _query, args = next(call for call in connection.calls if LEARNER_UPDATE in call[0])
    assert SECTION in args
    assert "improving" in args


def test_changing_a_learner_record_needs_a_live_session():
    client = build_client(student_connection(), live_session=False)

    response = client.patch(
        f"/api/v1/students/{STUDENT_ID}",
        json={"monitoring_status": "improving"},
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 401


def test_a_learner_cannot_change_another_learners_record():
    connection = student_connection()
    client = build_client(connection)

    response = client.patch(
        f"/api/v1/students/{STUDENT_ID}",
        json={"monitoring_status": "mastered"},
        headers=LEARNER_HEADERS,
    )

    assert response.status_code == 403
    assert not [call for call in connection.calls if LEARNER_UPDATE in call[0]]


def test_a_learner_who_has_no_record_is_not_found():
    client = build_client(student_connection(**{BY_STUDENT_ID: None}))

    response = client.get(f"/api/v1/students/{STUDENT_ID}", headers=ADVISER_HEADERS)

    assert response.status_code == 404
