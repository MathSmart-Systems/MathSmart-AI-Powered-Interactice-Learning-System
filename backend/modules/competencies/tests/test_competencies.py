"""Competency routes.

`GET /competencies` and `GET /competencies/{id}` are curriculum reads. Both
roles use them, and the difference between what a learner sees and what a
Teacher/Administrator sees is decided by Row Level Security, not by branching
here — which is why these tests check the contract and the filters, and the
integration tests check the visibility.
"""

from uuid import UUID

from modules.shared.testing import (
    ADVISER_HEADERS,
    LEARNER_HEADERS,
    FakeConnection,
    build_client,
)

COMPETENCY = UUID("13ec5f06-746e-45fb-a58a-92f4ce42621c")
GRADE = UUID("3f0f0000-0000-4000-8000-000000000006")
MODULE = UUID("4a39d286-e93e-4e75-9644-b873fcac185c")

ROW = {
    "competency_id": COMPETENCY,
    "code": "MATH6-INT-02",
    "grade_id": GRADE,
    "domain": "Number Sense",
    "name": "Multiplication and Division of Integers",
    "description": "Apply sign rules.",
    "status": "published",
    "prerequisite_ids": [],
}

MODULE_ROW = {
    "module_id": MODULE,
    "title": "Multiplication and Division of Integers",
    "estimated_minutes": 15,
    "status": "published",
    "order_index": 1,
}

PROGRESS_ROW = {
    "diagnostic_score": 35,
    "current_score": 40,
    "mastery_band": "Needs Improvement",
    "attempt_count": 2,
    "last_studied_at": None,
}


def test_a_learner_can_list_competencies():
    connection = FakeConnection(results={"count(*)": 1, "from app.competencies": [ROW]})
    client = build_client(connection)

    response = client.get("/api/v1/competencies", headers=LEARNER_HEADERS)

    assert response.status_code == 200
    body = response.json()
    assert body["data"][0]["code"] == "MATH6-INT-02"
    assert body["meta"]["total_items"] == 1


def test_listing_competencies_requires_a_token():
    client = build_client(FakeConnection())

    assert client.get("/api/v1/competencies").status_code == 401


def test_the_documented_filters_reach_the_query():
    connection = FakeConnection(results={"count(*)": 1, "from app.competencies": [ROW]})
    client = build_client(connection)

    client.get(
        "/api/v1/competencies",
        params={
            "grade_id": str(GRADE),
            "domain": "Number Sense",
            "status": "published",
            "search": "integers",
        },
        headers=ADVISER_HEADERS,
    )

    _, args = connection.calls[0]
    assert GRADE in args
    assert "Number Sense" in args
    assert "published" in args
    assert "integers" in args


def test_an_unknown_publication_status_is_rejected():
    client = build_client(FakeConnection())

    response = client.get(
        "/api/v1/competencies", params={"status": "leaked"}, headers=ADVISER_HEADERS
    )

    assert response.status_code == 422


def test_a_competency_detail_carries_its_modules():
    connection = FakeConnection(
        results={
            "where competencies.competency_id": ROW,
            "from app.learning_modules": [MODULE_ROW],
        }
    )
    client = build_client(connection)

    response = client.get(f"/api/v1/competencies/{COMPETENCY}", headers=ADVISER_HEADERS)

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["name"] == "Multiplication and Division of Integers"
    assert data["modules"][0]["title"] == "Multiplication and Division of Integers"


def test_a_competency_the_caller_cannot_see_is_not_found():
    """RLS returns no row. The API must not distinguish hidden from absent."""
    connection = FakeConnection(results={"from app.learning_modules": []})
    client = build_client(connection)

    response = client.get(f"/api/v1/competencies/{COMPETENCY}", headers=LEARNER_HEADERS)

    assert response.status_code == 404


def test_a_learner_sees_their_own_progress_on_a_competency():
    connection = FakeConnection(
        results={
            "where competencies.competency_id": ROW,
            "from app.learning_modules": [MODULE_ROW],
            "from app.competency_progress": PROGRESS_ROW,
        }
    )
    client = build_client(connection)

    response = client.get(f"/api/v1/competencies/{COMPETENCY}", headers=LEARNER_HEADERS)

    assert response.json()["data"]["progress"]["mastery_band"] == "Needs Improvement"


def test_a_teacher_admin_detail_carries_no_personal_progress():
    """There is no single learner in scope, so the field is absent, not invented."""
    connection = FakeConnection(
        results={
            "where competencies.competency_id": ROW,
            "from app.learning_modules": [MODULE_ROW],
            "from app.competency_progress": PROGRESS_ROW,
        }
    )
    client = build_client(connection)

    response = client.get(f"/api/v1/competencies/{COMPETENCY}", headers=ADVISER_HEADERS)

    assert response.json()["data"]["progress"] is None


def test_an_inactive_account_is_refused():
    client = build_client(FakeConnection(), account_active=False)

    response = client.get("/api/v1/competencies", headers=LEARNER_HEADERS)

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "account_disabled"
