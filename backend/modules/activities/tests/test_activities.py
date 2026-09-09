"""Activity routes.

An activity gives feedback while the learner is still working, so the two
things worth guarding are what comes back and who may ask. The verdict, the
authored explanation and the hint all come from database functions that read
columns the API connection cannot select; the answer key is never among them.

The arithmetic, the pass decision and the intervention trigger are proved
against PostgreSQL in
`supabase/tests/540_activity_attempt_functions_test.sql`.
"""

import re
from uuid import UUID

import pytest

from modules.shared.testing import (
    ADVISER_HEADERS,
    LEARNER_HEADERS,
    FakeConnection,
    build_client,
)

ACTIVITY = UUID("fd80cc3c-4951-439c-894e-f93cbf7a23e1")
ATTEMPT = UUID("6169d019-490a-46ae-94a2-3f2f3fe1e8f5")
QUESTION = UUID("a89d7d3f-8e80-4564-9681-11531088fab9")
MODULE = UUID("4a39d286-e93e-4e75-9644-b873fcac185c")
COMPETENCY = UUID("13ec5f06-746e-45fb-a58a-92f4ce42621c")
STUDENT_ID = UUID("58000000-0000-4000-8000-000000000001")

# Anchors that appear in exactly one statement each.
ACTIVITY_LIST = "order by activities.title"
ACTIVITY_BY_ID = "where activities.activity_id = $2"
TOTAL = "count(*) as total"
QUESTIONS = "order by activity_questions.position"
ATTEMPT_HISTORY = "limit $2 offset $3"
SAVED = "from app.activity_responses"

ACTIVITY_ROW = {
    "activity_id": ACTIVITY,
    "module_id": MODULE,
    "module_title": "Multiplication and Division of Integers",
    "competency_id": COMPETENCY,
    "competency_name": "Multiplication and Division of Integers",
    "title": "Integer Sign Practice",
    "description": "Practise the sign rules.",
    "estimated_minutes": 10,
    "points": 10,
    "mastery_threshold": 75,
    "status": "published",
    "attempt_count": 1,
    "best_score": 60,
    "path_status": "available",
}

QUESTION_ROW = {
    "question_id": QUESTION,
    "competency_id": COMPETENCY,
    "competency_name": "Multiplication and Division of Integers",
    "prompt": "What is (-9) x (-8)?",
    "question_type": "number_input",
    "choices": [],
    "difficulty": "medium",
    "visual_aid_description": None,
    "position": 1,
}

ATTEMPT_ROW = {
    "attempt_id": ATTEMPT,
    "activity_id": ACTIVITY,
    "student_id": STUDENT_ID,
    "status": "in_progress",
    "attempt_number": 2,
    "started_at": None,
    "submitted_at": None,
    "score_percentage": None,
    "raw_score": None,
    "max_score": None,
    "passed": None,
    "mastery_status": None,
    "time_spent_seconds": 0,
}

CHECK_ROW = {
    "is_correct": False,
    "attempts_for_question": 1,
    "explanation": "Two negative factors produce a positive product.",
    "hint_available": True,
}

SUBMIT_ROW = {
    "attempt_id": ATTEMPT,
    "raw_score": 9,
    "max_score": 10,
    "score_percentage": 90,
    "passed": True,
    "attempt_number": 2,
    "mastery_status": "Developing",
    "previous_competency_score": 35,
    "current_competency_score": 78,
    "intervention_created": False,
}

SAVED_ROW = {"question_id": QUESTION, "answer": '"72"'}

HISTORY_ROW = {
    **ATTEMPT_ROW,
    "title": "Integer Sign Practice",
    "competency_id": COMPETENCY,
    "competency_name": "Multiplication and Division of Integers",
    "status": "scored",
    "score_percentage": 90,
    "raw_score": 9,
    "max_score": 10,
    "passed": True,
}


def activity_connection(**overrides):
    results = {
        "app.start_activity_attempt": ATTEMPT_ROW,
        "app.check_activity_answer": CHECK_ROW,
        "app.submit_activity_attempt": SUBMIT_ROW,
        "app.activity_hint": "Check the signs before multiplying the magnitudes.",
        ACTIVITY_BY_ID: ACTIVITY_ROW,
        QUESTIONS: [QUESTION_ROW],
        SAVED: [SAVED_ROW],
        "where activity_attempts.attempt_id = $1": ATTEMPT_ROW,
    }
    results.update(overrides)
    return FakeConnection(results=results)


# ---------------------------------------------------------------------------
# The catalogue
# ---------------------------------------------------------------------------


def test_a_learner_can_list_activities():
    connection = FakeConnection(results={TOTAL: 1, ACTIVITY_LIST: [ACTIVITY_ROW]})
    client = build_client(connection)

    response = client.get("/api/v1/activities", headers=LEARNER_HEADERS)

    assert response.status_code == 200
    activity = response.json()["data"][0]
    assert activity["title"] == "Integer Sign Practice"
    assert activity["best_score"] == 60
    assert activity["path_status"] == "available"


def test_the_documented_activity_filters_reach_the_query():
    connection = FakeConnection(results={TOTAL: 1, ACTIVITY_LIST: [ACTIVITY_ROW]})
    client = build_client(connection)

    client.get(
        "/api/v1/activities",
        params={
            "module_id": str(MODULE),
            "competency_id": str(COMPETENCY),
            "status": "published",
            "search": "sign",
        },
        headers=ADVISER_HEADERS,
    )

    _, args = connection.calls[0]
    assert MODULE in args
    assert COMPETENCY in args
    assert "published" in args
    assert "sign" in args


def test_an_activity_detail_delivers_questions_without_answers():
    client = build_client(activity_connection())

    response = client.get(f"/api/v1/activities/{ACTIVITY}", headers=LEARNER_HEADERS)

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["mastery_threshold"] == 75
    assert data["questions"][0]["text"] == "What is (-9) x (-8)?"
    for forbidden in ("answer_key", "correct_answer", "hint", "explanation"):
        assert forbidden not in response.text


def test_an_activity_the_caller_cannot_see_is_not_found():
    client = build_client(FakeConnection())

    response = client.get(f"/api/v1/activities/{ACTIVITY}", headers=LEARNER_HEADERS)

    assert response.status_code == 404


# ---------------------------------------------------------------------------
# Attempts
# ---------------------------------------------------------------------------


def test_starting_an_activity_attempt_reports_its_number():
    connection = activity_connection(**{SAVED: []})
    client = build_client(connection)

    response = client.post(f"/api/v1/activities/{ACTIVITY}/attempts", headers=LEARNER_HEADERS)

    assert response.status_code == 201
    data = response.json()["data"]
    assert data["attempt_id"] == str(ATTEMPT)
    assert data["attempt_number"] == 2
    assert data["saved_answers"] == {}


def test_a_repeated_start_resumes_with_the_saved_answers():
    client = build_client(activity_connection())

    response = client.post(f"/api/v1/activities/{ACTIVITY}/attempts", headers=LEARNER_HEADERS)

    assert response.status_code == 200
    assert response.json()["data"]["saved_answers"] == {str(QUESTION): "72"}


def test_a_teacher_admin_does_not_sit_an_activity():
    connection = activity_connection()
    client = build_client(connection)

    response = client.post(f"/api/v1/activities/{ACTIVITY}/attempts", headers=ADVISER_HEADERS)

    assert response.status_code == 403
    assert not [c for c in connection.calls if "app.start_activity_attempt" in c[0]]


# ---------------------------------------------------------------------------
# Answer checks and hints
# ---------------------------------------------------------------------------


def test_an_answer_check_returns_the_verdict_and_the_authored_explanation():
    client = build_client(activity_connection())

    response = client.post(
        f"/api/v1/activity-attempts/{ATTEMPT}/answer-checks",
        json={"question_id": str(QUESTION), "answer": "-72"},
        headers=LEARNER_HEADERS,
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["is_correct"] is False
    assert data["attempts_for_question"] == 1
    assert data["explanation"].startswith("Two negative factors")
    assert data["hint_available"] is True
    # Groq is advisory and absent unless it answered.
    assert data["ai_feedback"] is None


def test_an_answer_check_never_returns_an_answer_key():
    client = build_client(activity_connection())

    response = client.post(
        f"/api/v1/activity-attempts/{ATTEMPT}/answer-checks",
        json={"question_id": str(QUESTION), "answer": "-72"},
        headers=LEARNER_HEADERS,
    )

    for forbidden in ("answer_key", "correct_answer"):
        assert forbidden not in response.text


def test_a_hint_is_returned_without_the_answer():
    client = build_client(activity_connection())

    response = client.post(
        f"/api/v1/activity-attempts/{ATTEMPT}/hints",
        json={"question_id": str(QUESTION)},
        headers=LEARNER_HEADERS,
    )

    assert response.status_code == 200
    assert response.json()["data"]["hint"].startswith("Check the signs")


def test_a_question_with_no_authored_hint_says_so():
    client = build_client(activity_connection(**{"app.activity_hint": None}))

    response = client.post(
        f"/api/v1/activity-attempts/{ATTEMPT}/hints",
        json={"question_id": str(QUESTION)},
        headers=LEARNER_HEADERS,
    )

    assert response.status_code == 200
    assert response.json()["data"]["hint"] is None


def test_a_teacher_admin_does_not_check_answers():
    connection = activity_connection()
    client = build_client(connection)

    response = client.post(
        f"/api/v1/activity-attempts/{ATTEMPT}/answer-checks",
        json={"question_id": str(QUESTION), "answer": "72"},
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 403
    assert not [c for c in connection.calls if "app.check_activity_answer" in c[0]]


# ---------------------------------------------------------------------------
# Submission
# ---------------------------------------------------------------------------


def test_submitting_an_activity_returns_the_deterministic_outcome():
    client = build_client(activity_connection())

    response = client.post(
        f"/api/v1/activity-attempts/{ATTEMPT}/submit",
        json={"answers": [{"question_id": str(QUESTION), "answer": "72"}],
              "time_spent_seconds": 420},
        headers=LEARNER_HEADERS,
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["score"] == 9
    assert data["max_score"] == 10
    assert data["accuracy"] == 90
    assert data["passed"] is True
    assert data["previous_competency_score"] == 35
    assert data["current_competency_score"] == 78
    assert data["intervention_created"] is False
    assert data["next_action"]["type"]


def test_a_submission_sends_the_time_spent_it_was_given():
    connection = activity_connection()
    client = build_client(connection)

    client.post(
        f"/api/v1/activity-attempts/{ATTEMPT}/submit",
        json={"answers": [], "time_spent_seconds": 420},
        headers=LEARNER_HEADERS,
    )

    _query, args = next(
        call for call in connection.calls if "app.submit_activity_attempt" in call[0]
    )
    assert args[0] == ATTEMPT
    assert args[2] == 420


def test_negative_time_spent_is_refused():
    client = build_client(activity_connection())

    response = client.post(
        f"/api/v1/activity-attempts/{ATTEMPT}/submit",
        json={"answers": [], "time_spent_seconds": -1},
        headers=LEARNER_HEADERS,
    )

    assert response.status_code == 422


def test_a_submission_cannot_name_a_learner():
    client = build_client(activity_connection())

    response = client.post(
        f"/api/v1/activity-attempts/{ATTEMPT}/submit",
        json={"answers": [], "student_id": str(STUDENT_ID)},
        headers=LEARNER_HEADERS,
    )

    assert response.status_code == 422
    assert "student_id" in response.json()["error"]["fields"]


# ---------------------------------------------------------------------------
# History
# ---------------------------------------------------------------------------


def test_a_teacher_admin_reads_a_learners_activity_history():
    connection = FakeConnection(results={TOTAL: 1, ATTEMPT_HISTORY: [HISTORY_ROW]})
    client = build_client(connection)

    response = client.get(
        f"/api/v1/students/{STUDENT_ID}/activity-attempts", headers=ADVISER_HEADERS
    )

    assert response.status_code == 200
    attempt = response.json()["data"][0]
    assert attempt["title"] == "Integer Sign Practice"
    assert attempt["accuracy"] == 90


def test_a_learner_cannot_ask_for_another_learners_activity_history():
    connection = FakeConnection(results={TOTAL: 1, ATTEMPT_HISTORY: [HISTORY_ROW]})
    client = build_client(connection)

    response = client.get(
        f"/api/v1/students/{STUDENT_ID}/activity-attempts", headers=LEARNER_HEADERS
    )

    assert response.status_code == 403


@pytest.mark.parametrize("path", ["/api/v1/activities", f"/api/v1/activities/{ACTIVITY}"])
def test_activity_reads_need_a_token(path):
    client = build_client(FakeConnection())

    assert client.get(path).status_code == 401


# ---------------------------------------------------------------------------
# Bind parameters
# ---------------------------------------------------------------------------
# PostgreSQL infers a statement's parameter count from the highest-numbered
# `$n` it references, and every lower number must be referenced too or the bind
# is untyped and the statement is rejected (42P08). The fake connection never
# binds, so nothing else here would notice.


def _placeholders(statement: str) -> set[int]:
    return {int(number) for number in re.findall(r"\$(\d+)", statement)}


def _assert_binds_are_contiguous(connection) -> None:
    assert connection.calls
    for statement, args in connection.calls:
        numbers = _placeholders(statement)
        highest = max(numbers, default=0)
        assert numbers == set(range(1, highest + 1)), statement
        assert len(args) == highest, statement


def test_the_activity_count_binds_exactly_what_it_references():
    connection = FakeConnection(results={TOTAL: 1, ACTIVITY_LIST: [ACTIVITY_ROW]})
    client = build_client(connection)

    client.get(
        "/api/v1/activities",
        params={"module_id": str(MODULE), "search": "sign"},
        headers=LEARNER_HEADERS,
    )

    _assert_binds_are_contiguous(connection)


def test_the_attempt_history_count_binds_exactly_what_it_references():
    connection = FakeConnection(results={TOTAL: 1, ATTEMPT_HISTORY: [HISTORY_ROW]})
    client = build_client(connection)

    client.get(
        f"/api/v1/students/{STUDENT_ID}/activity-attempts",
        params={"activity_id": str(ACTIVITY), "passed": "true"},
        headers=ADVISER_HEADERS,
    )

    _assert_binds_are_contiguous(connection)
