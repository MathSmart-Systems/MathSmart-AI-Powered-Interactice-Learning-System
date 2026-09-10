"""Progress routes.

`GET /progress/me` and `GET /progress/{student_id}` answer the same question
from the same statements. The difference is who may ask about whom: a learner
asks about themselves, and naming a learner is a Teacher/Administrator's action
— which the policies enforce a second time, so a mistake here is not the only
thing standing between one learner and another's record.

Growth is a subtraction, not an opinion, and the recommended next action is the
first available item of the learner's own path.
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
ACTIVITY = UUID("fd80cc3c-4951-439c-894e-f93cbf7a23e1")

SUMMARY = "from app.student_performance_summary"
OWN_STUDENT = "where student_profiles.user_id = $1"
COMPETENCIES = "from app.competency_progress"
PATH = "from app.learning_path_items"
TRAJECTORY = "from app.activity_attempts"
MODULE_TOTAL = "count(*) as total_modules"

SUMMARY_ROW = {
    "student_id": STUDENT_ID,
    "learner_id": "STU-2026-001",
    "full_name": "Juan Dela Cruz",
    "grade_id": None,
    "section_id": None,
    "monitoring_status": "needs_intervention",
    "diagnostic_average": 48,
    "current_average": 63,
    "competencies_mastered": 1,
    "modules_completed": 1,
    "modules_started": 3,
    "scored_attempt_count": 2,
    "worst_unsuccessful_attempts": 1,
    "open_intervention_count": 1,
    "last_studied_at": None,
}

COMPETENCY_ROW = {
    "competency_id": COMPETENCY,
    "competency_code": "MATH6-INT-02",
    "competency_name": "Multiplication and Division of Integers",
    "diagnostic_score": 35,
    "current_score": 78,
    "mastery_band": "Developing",
    "attempt_count": 2,
    "unsuccessful_attempts": 1,
    "last_studied_at": None,
}

PATH_ROW = {
    "path_item_id": UUID("821a14d6-c49a-4f42-bc04-96388ec76a31"),
    "priority": 1,
    "status": "available",
    "module_id": MODULE,
    "module_title": "Integer Sign Rules",
    "competency_id": COMPETENCY,
}

TRAJECTORY_ROW = {
    "competency_id": COMPETENCY,
    "occurred_at": None,
    "score": 78,
    "label": "Activity Attempt 2",
    "activity_id": ACTIVITY,
    "title": "Integer Sign Practice",
}


def progress_connection(**overrides):
    results = {
        OWN_STUDENT: STUDENT_ID,
        SUMMARY: SUMMARY_ROW,
        COMPETENCIES: [COMPETENCY_ROW],
        PATH: [PATH_ROW],
        TRAJECTORY: [TRAJECTORY_ROW],
        MODULE_TOTAL: 5,
    }
    results.update(overrides)
    return FakeConnection(results=results)


def test_a_learner_reads_their_own_progress():
    client = build_client(progress_connection())

    response = client.get("/api/v1/progress/me", headers=LEARNER_HEADERS)

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["student_id"] == str(STUDENT_ID)
    assert data["overall_mastery"] == 63
    assert data["diagnostic_score"] == 48
    assert data["modules_completed_count"] == 1
    assert data["total_modules_count"] == 5
    assert data["active_intervention_count"] == 1


def test_growth_is_the_difference_between_the_diagnostic_and_now():
    client = build_client(progress_connection())

    response = client.get("/api/v1/progress/me", headers=LEARNER_HEADERS)

    assert response.json()["data"]["growth"] == 15
    assert response.json()["data"]["competencies"][0]["growth"] == 43


def response_action(client):
    return client.get("/api/v1/progress/me", headers=LEARNER_HEADERS).json()["data"][
        "recommended_next_action"
    ]


def test_the_recommended_next_action_is_the_first_available_path_item():
    action = response_action(build_client(progress_connection()))

    assert action["type"] == "module"
    assert action["resource_id"] == str(MODULE)
    assert "Integer Sign Rules" in action["label"]


def test_a_learner_with_no_path_is_sent_to_the_dashboard():
    client = build_client(progress_connection(**{PATH: []}))

    assert response_action(client)["type"] == "dashboard"


def test_a_competency_carries_its_trajectory():
    client = build_client(progress_connection())

    response = client.get("/api/v1/progress/me", headers=LEARNER_HEADERS)

    competency = response.json()["data"]["competencies"][0]
    assert competency["trajectory"][0]["score"] == 78
    assert competency["trajectory"][0]["label"] == "Activity Attempt 2"


def test_a_teacher_admin_has_no_learner_record_of_their_own():
    client = build_client(progress_connection(**{OWN_STUDENT: None}))

    response = client.get("/api/v1/progress/me", headers=ADVISER_HEADERS)

    assert response.status_code == 403


def test_a_learner_may_name_themselves():
    client = build_client(progress_connection())

    response = client.get(f"/api/v1/progress/{STUDENT_ID}", headers=LEARNER_HEADERS)

    assert response.status_code == 200


def test_a_learner_may_not_name_another_learner():
    connection = progress_connection()
    client = build_client(connection)

    response = client.get(f"/api/v1/progress/{OTHER_STUDENT}", headers=LEARNER_HEADERS)

    assert response.status_code == 403
    assert not [call for call in connection.calls if SUMMARY in call[0]]


def test_a_teacher_admin_may_name_any_learner():
    client = build_client(progress_connection())

    response = client.get(f"/api/v1/progress/{OTHER_STUDENT}", headers=ADVISER_HEADERS)

    assert response.status_code == 200


def test_a_learner_who_has_no_record_is_not_found():
    client = build_client(progress_connection(**{SUMMARY: None}))

    response = client.get(f"/api/v1/progress/{OTHER_STUDENT}", headers=ADVISER_HEADERS)

    assert response.status_code == 404


def test_progress_needs_a_token():
    client = build_client(FakeConnection())

    assert client.get("/api/v1/progress/me").status_code == 401


def test_the_learner_identity_comes_from_the_token():
    """`/progress/me` never reads a learner identifier from the request."""
    connection = progress_connection()
    client = build_client(connection)

    client.get("/api/v1/progress/me", headers=LEARNER_HEADERS)

    _query, args = next(call for call in connection.calls if OWN_STUDENT in call[0])
    assert args == (LEARNER,)
