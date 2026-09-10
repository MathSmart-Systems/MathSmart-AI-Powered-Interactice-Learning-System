"""Learning path routes.

The path is the learner's own ordered list. `GET /learning-path/me` never reads
a learner identifier from the request, and naming one is a
Teacher/Administrator's action — enforced here and again by the policies on
`app.learning_path_items`.
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
OTHER_STUDENT = UUID("58000000-0000-4000-8000-0000000000ff")
COMPETENCY = UUID("13ec5f06-746e-45fb-a58a-92f4ce42621c")
MODULE = UUID("4a39d286-e93e-4e75-9644-b873fcac185c")
PATH_ITEM = UUID("821a14d6-c49a-4f42-bc04-96388ec76a31")

OWN_STUDENT = "where student_profiles.user_id = $1"
PATH = "from app.learning_path_items"

PATH_ROW = {
    "path_item_id": PATH_ITEM,
    "priority": 1,
    "reason": "Diagnostic score of 35% indicates a foundational sign-rule gap.",
    "status": "available",
    "competency_id": COMPETENCY,
    "competency_code": "MATH6-INT-02",
    "competency_name": "Multiplication and Division of Integers",
    "module_id": MODULE,
    "module_title": "Multiplication and Division of Integers",
    "estimated_minutes": 15,
}


def path_connection(**overrides):
    results = {OWN_STUDENT: STUDENT_ID, PATH: [PATH_ROW]}
    results.update(overrides)
    return FakeConnection(results=results)


def test_a_learner_reads_their_own_path():
    client = build_client(path_connection())

    response = client.get("/api/v1/learning-path/me", headers=LEARNER_HEADERS)

    assert response.status_code == 200
    item = response.json()["data"][0]
    assert item["priority"] == 1
    assert item["status"] == "available"
    assert item["competency"]["code"] == "MATH6-INT-02"
    assert item["module"]["estimated_minutes"] == 15
    assert item["reason"].startswith("Diagnostic score")


def test_the_learner_identity_comes_from_the_token():
    connection = path_connection()
    client = build_client(connection)

    client.get("/api/v1/learning-path/me", headers=LEARNER_HEADERS)

    _query, args = next(call for call in connection.calls if OWN_STUDENT in call[0])
    assert args == (LEARNER,)


def test_a_teacher_admin_has_no_path_of_their_own():
    client = build_client(path_connection(**{OWN_STUDENT: None}))

    response = client.get("/api/v1/learning-path/me", headers=ADVISER_HEADERS)

    assert response.status_code == 403


def test_a_teacher_admin_may_read_a_named_learners_path():
    client = build_client(path_connection())

    response = client.get(f"/api/v1/learning-path/{OTHER_STUDENT}", headers=ADVISER_HEADERS)

    assert response.status_code == 200


def test_a_learner_may_not_read_another_learners_path():
    connection = path_connection()
    client = build_client(connection)

    response = client.get(f"/api/v1/learning-path/{OTHER_STUDENT}", headers=LEARNER_HEADERS)

    assert response.status_code == 403
    assert not [call for call in connection.calls if PATH in call[0]]


def test_the_path_needs_a_token():
    client = build_client(FakeConnection())

    assert client.get("/api/v1/learning-path/me").status_code == 401
