"""Intervention routes.

The queue is a Teacher/Administrator's, and so is every mutation. Each write
goes through a database function that takes the educator from `auth.uid()`,
enforces the documented lifecycle, and writes its own audit row — so these tests
check who may ask, what the request may carry, and that a case is archived
rather than deleted.

The lifecycle rules themselves are proved against PostgreSQL in
`supabase/tests/550_intervention_functions_test.sql`.
"""

from uuid import UUID

from modules.shared.testing import (
    ADVISER_HEADERS,
    LEARNER_HEADERS,
    FakeConnection,
    build_client,
)

INTERVENTION = UUID("f87d7703-ef37-4bfa-943f-c2bc7e69cb01")
STUDENT_ID = UUID("58000000-0000-4000-8000-000000000001")
COMPETENCY = UUID("13ec5f06-746e-45fb-a58a-92f4ce42621c")

QUEUE = "order by interventions.severity"
BY_ID = "where interventions.intervention_id = $1"
TOTAL = "count(*) as total"

ROW = {
    "intervention_id": INTERVENTION,
    "student_id": STUDENT_ID,
    "learner_id": "STU-2026-001",
    "full_name": "Juan Dela Cruz",
    "section_id": None,
    "section_name": "Rizal",
    "grade_id": None,
    "competency_id": COMPETENCY,
    "competency_code": "MATH6-INT-02",
    "competency_name": "Multiplication and Division of Integers",
    "severity": "HIGH",
    "status": "In Progress",
    "intervention_type": "One-on-One Remediation",
    "incorrect_patterns": [],
    "modules_attempted": [],
    "educator_notes": "Scheduled a 15-minute guided number-line session.",
    "ai_insight": None,
    "ai_recommendation": None,
    "ai_provider": None,
    "ai_model": None,
    "ai_confidence_score": None,
    "recorded_by": "Maria Santos",
    "teacher_admin_id": UUID("4c000000-0000-4000-8000-000000000001"),
    "diagnostic_score": 35,
    "current_score": 40,
    "attempt_count": 3,
    "unsuccessful_attempts": 2,
    "created_at": None,
    "recorded_at": None,
    "resolved_at": None,
    "archived_at": None,
    "reopen_reason": None,
}

CREATE_BODY = {
    "student_id": str(STUDENT_ID),
    "competency_id": str(COMPETENCY),
    "severity": "HIGH",
    "intervention_type": "One-on-One Remediation",
    "educator_notes": "Scheduled a 15-minute guided number-line session.",
}


#: What `select * from app.open_intervention(...)` can actually return: the
#: function's return type is app.interventions, so its row carries that table's
#: columns and nothing from the learner, the competency or the educator. The
#: fakes answered every statement with the reporting shape once, which hid a
#: KeyError on `recorded_by` behind a green suite while the live route returned
#: 500.
WRITTEN_ROW = {
    "intervention_id": INTERVENTION,
    "student_id": STUDENT_ID,
    "teacher_admin_id": UUID("4c000000-0000-4000-8000-000000000001"),
    "competency_id": COMPETENCY,
    "severity": "HIGH",
    "status": "In Progress",
    "intervention_type": "One-on-One Remediation",
    "incorrect_patterns": [],
    "modules_attempted": [],
    "educator_notes": "Scheduled a 15-minute guided number-line session.",
    "reopen_reason": None,
    "ai_insight": None,
    "ai_recommendation": None,
    "ai_provider": None,
    "ai_model": None,
    "ai_confidence_score": None,
    "created_at": None,
    "recorded_at": None,
    "resolved_at": None,
    "archived_at": None,
}


def intervention_connection(**overrides):
    results = {
        "app.open_intervention": WRITTEN_ROW,
        "app.update_intervention": WRITTEN_ROW,
        "app.archive_intervention": True,
        QUEUE: [ROW],
        BY_ID: ROW,
        TOTAL: 1,
    }
    results.update(overrides)
    return FakeConnection(results=results)


# ---------------------------------------------------------------------------
# The queue
# ---------------------------------------------------------------------------


def test_a_teacher_admin_reads_the_queue():
    client = build_client(intervention_connection())

    response = client.get("/api/v1/interventions", headers=ADVISER_HEADERS)

    assert response.status_code == 200
    case = response.json()["data"][0]
    assert case["severity"] == "HIGH"
    assert case["student"]["full_name"] == "Juan Dela Cruz"


def test_the_documented_queue_filters_reach_the_query():
    connection = intervention_connection()
    client = build_client(connection)

    client.get(
        "/api/v1/interventions",
        params={
            "student_id": str(STUDENT_ID),
            "competency_id": str(COMPETENCY),
            "severity": "HIGH",
            "status": "In Progress",
        },
        headers=ADVISER_HEADERS,
    )

    _, args = connection.calls[0]
    assert STUDENT_ID in args
    assert COMPETENCY in args
    assert "HIGH" in args
    assert "In Progress" in args


def test_a_learner_cannot_read_the_queue():
    connection = intervention_connection()
    client = build_client(connection)

    response = client.get("/api/v1/interventions", headers=LEARNER_HEADERS)

    assert response.status_code == 403


def test_an_unknown_severity_is_refused():
    client = build_client(intervention_connection())

    response = client.get(
        "/api/v1/interventions", params={"severity": "CATASTROPHIC"}, headers=ADVISER_HEADERS
    )

    assert response.status_code == 422


def test_a_case_can_be_read_in_full():
    client = build_client(intervention_connection())

    response = client.get(f"/api/v1/interventions/{INTERVENTION}", headers=ADVISER_HEADERS)

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["competency"]["name"] == "Multiplication and Division of Integers"
    assert data["evidence"]["unsuccessful_attempts"] == 2
    assert data["recorded_by"] == "Maria Santos"


def test_a_case_that_does_not_exist_is_not_found():
    client = build_client(intervention_connection(**{BY_ID: None}))

    response = client.get(f"/api/v1/interventions/{INTERVENTION}", headers=ADVISER_HEADERS)

    assert response.status_code == 404


# ---------------------------------------------------------------------------
# Recording and updating
# ---------------------------------------------------------------------------


def test_a_teacher_admin_records_a_case():
    client = build_client(intervention_connection())

    response = client.post("/api/v1/interventions", json=CREATE_BODY, headers=ADVISER_HEADERS)

    assert response.status_code == 201
    data = response.json()["data"]
    assert data["id"] == str(INTERVENTION)
    assert data["status"] == "In Progress"
    assert data["recorded_by"] == "Maria Santos"


def test_recording_a_case_reads_it_back_for_the_response():
    """The write returns an app.interventions row; the response needs more.

    A case is answered with the educator who recorded it, which the function's
    own row cannot carry. The route must read the case back through the detail
    statement, in the same transaction, or it fails on a column that was never
    selected.
    """
    connection = intervention_connection()
    client = build_client(connection)

    response = client.post("/api/v1/interventions", json=CREATE_BODY, headers=ADVISER_HEADERS)

    assert response.status_code == 201
    assert response.json()["data"]["recorded_by"] == "Maria Santos"
    statements = [statement for statement, _ in connection.calls]
    assert any("app.open_intervention" in statement for statement in statements)
    assert any(BY_ID in statement for statement in statements)


def test_updating_a_case_reads_it_back_for_the_response():
    connection = intervention_connection()
    client = build_client(connection)

    response = client.patch(
        f"/api/v1/interventions/{INTERVENTION}",
        json={"status": "Resolved"},
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["recorded_by"] == "Maria Santos"
    assert data["competency"]["name"] == "Multiplication and Division of Integers"
    assert any(BY_ID in statement for statement, _ in connection.calls)


def test_a_learner_cannot_record_a_case():
    connection = intervention_connection()
    client = build_client(connection)

    response = client.post("/api/v1/interventions", json=CREATE_BODY, headers=LEARNER_HEADERS)

    assert response.status_code == 403
    assert not [c for c in connection.calls if "app.open_intervention" in c[0]]


def test_recording_a_case_needs_a_live_session():
    """An educator decision about a learner, so a signed-out token is refused."""
    connection = intervention_connection()
    client = build_client(connection, live_session=False)

    response = client.post("/api/v1/interventions", json=CREATE_BODY, headers=ADVISER_HEADERS)

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "session_revoked"


def test_a_case_request_cannot_choose_the_educator():
    client = build_client(intervention_connection())

    response = client.post(
        "/api/v1/interventions",
        json={**CREATE_BODY, "teacher_admin_id": "4c000000-0000-4000-8000-000000000001"},
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 422
    assert "teacher_admin_id" in response.json()["error"]["fields"]


def test_a_case_request_cannot_supply_an_ai_insight():
    """Advisory text is written by the AI routes, never asserted by a request."""
    client = build_client(intervention_connection())

    response = client.post(
        "/api/v1/interventions",
        json={**CREATE_BODY, "ai_insight": "The learner confuses sign rules."},
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 422


def test_a_case_can_be_updated():
    client = build_client(intervention_connection())

    response = client.patch(
        f"/api/v1/interventions/{INTERVENTION}",
        json={"status": "Resolved"},
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 200
    assert response.json()["data"]["status"] == "In Progress"


def test_an_update_sends_the_reopen_reason_it_was_given():
    connection = intervention_connection()
    client = build_client(connection)

    client.patch(
        f"/api/v1/interventions/{INTERVENTION}",
        json={"status": "In Progress", "reopen_reason": "The learner regressed."},
        headers=ADVISER_HEADERS,
    )

    _query, args = next(
        call for call in connection.calls if "app.update_intervention" in call[0]
    )
    assert "The learner regressed." in args


def test_a_learner_cannot_update_a_case():
    connection = intervention_connection()
    client = build_client(connection)

    response = client.patch(
        f"/api/v1/interventions/{INTERVENTION}",
        json={"status": "Resolved"},
        headers=LEARNER_HEADERS,
    )

    assert response.status_code == 403
    assert not [c for c in connection.calls if "app.update_intervention" in c[0]]


# ---------------------------------------------------------------------------
# Archiving
# ---------------------------------------------------------------------------


def test_archiving_a_case_returns_no_content():
    client = build_client(intervention_connection())

    response = client.delete(f"/api/v1/interventions/{INTERVENTION}", headers=ADVISER_HEADERS)

    assert response.status_code == 204
    assert response.content == b""


def test_archiving_a_case_that_is_already_archived_is_not_found():
    client = build_client(intervention_connection(**{"app.archive_intervention": False}))

    response = client.delete(f"/api/v1/interventions/{INTERVENTION}", headers=ADVISER_HEADERS)

    assert response.status_code == 404


def test_a_learner_cannot_archive_a_case():
    connection = intervention_connection()
    client = build_client(connection)

    response = client.delete(f"/api/v1/interventions/{INTERVENTION}", headers=LEARNER_HEADERS)

    assert response.status_code == 403
    assert not [c for c in connection.calls if "app.archive_intervention" in c[0]]


def test_the_queue_needs_a_token():
    client = build_client(FakeConnection())

    assert client.get("/api/v1/interventions").status_code == 401
