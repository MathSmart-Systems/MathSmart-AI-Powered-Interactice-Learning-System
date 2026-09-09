"""Assessment routes.

The rule that matters here is what never appears in a response. A question
delivered before submission carries its prompt, its choices and its difficulty,
and nothing that discloses the answer — the answer key is not withheld by this
code being careful, it is withheld by a column privilege the API connection
does not hold, and grading happens inside the database for the same reason.

Scores, bands, path items and statuses all come back from
`app.submit_assessment_attempt`. These tests check routing, authorization and
the response envelope; the arithmetic is proved against PostgreSQL in
`supabase/tests/530_assessment_attempt_functions_test.sql`.
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

ASSESSMENT = UUID("30e7f94d-0daa-4c0d-9a4b-908e47029a51")
ATTEMPT = UUID("5b2b9640-1cf7-4210-8910-dfd605d30d77")
QUESTION = UUID("a89d7d3f-8e80-4564-9681-11531088fab9")
COMPETENCY = UUID("13ec5f06-746e-45fb-a58a-92f4ce42621c")
MODULE = UUID("4a39d286-e93e-4e75-9644-b873fcac185c")
GRADE = UUID("3f0f0000-0000-4000-8000-000000000006")
STUDENT_ID = UUID("58000000-0000-4000-8000-000000000001")
PATH_ITEM = UUID("821a14d6-c49a-4f42-bc04-96388ec76a31")

ASSESSMENT_ROW = {
    "assessment_id": ASSESSMENT,
    "grade_id": GRADE,
    "title": "Grade 6 Mathematics Diagnostic Assessment",
    "assessment_type": "diagnostic",
    "status": "published",
    "duration_minutes": 30,
    "description": None,
    "total_questions": 2,
    "attempt_count": 0,
    "latest_attempt_id": None,
    "latest_status": None,
}

ATTEMPT_ROW = {
    "attempt_id": ATTEMPT,
    "assessment_id": ASSESSMENT,
    "student_id": STUDENT_ID,
    "status": "in_progress",
    "overall_score": None,
    "started_at": None,
    "submitted_at": None,
}

SCORED_ROW = {
    **ATTEMPT_ROW,
    "status": "scored",
    "overall_score": 50,
}

HISTORY_ROW = {
    **ATTEMPT_ROW,
    "title": "Grade 6 Mathematics Diagnostic Assessment",
    "assessment_type": "diagnostic",
}

QUESTION_ROW = {
    "question_id": QUESTION,
    "competency_id": COMPETENCY,
    "competency_name": "Multiplication and Division of Integers",
    "prompt": "What is (-9) x (-8)?",
    "question_type": "multiple_choice",
    "choices": ["-72", "72", "-17", "17"],
    "difficulty": "medium",
    "visual_aid_description": None,
    "position": 1,
}

RESPONSE_ROW = {"question_id": QUESTION, "answer": '"72"', "is_correct": None}

RESULT_ROW = {
    "competency_id": COMPETENCY,
    "competency_name": "Multiplication and Division of Integers",
    "raw_score": 1,
    "max_score": 2,
    "percentage": 50,
    "mastery_band": "Developing",
}

PATH_ROW = {
    "path_item_id": PATH_ITEM,
    "priority": 1,
    "reason": "Assessment score of 50% places this competency in the Developing band.",
    "status": "available",
    "competency_id": COMPETENCY,
    "competency_code": "MATH6-INT-02",
    "competency_name": "Multiplication and Division of Integers",
    "module_id": MODULE,
    "module_title": "Multiplication and Division of Integers",
    "estimated_minutes": 15,
}


# Each key is an anchor that appears in exactly one statement, so a fake answer
# reaches the query it was written for.
OPEN_ATTEMPT = "assessment_attempts.status = 'in_progress'"
ATTEMPT_BY_ID = "where assessment_attempts.attempt_id = $1"
ASSESSMENT_BY_ID = "where assessments.assessment_id"
ASSESSMENT_LIST = "order by assessments.title"
TOTAL = "count(*) as total"
QUESTIONS = "order by assessment_questions.position"
HISTORY = "limit $2 offset $3"


def attempt_connection(**overrides):
    results = {
        "app.start_assessment_attempt": ATTEMPT_ROW,
        "app.save_assessment_answers": 1,
        "app.submit_assessment_attempt": SCORED_ROW,
        "app.authorize_reassessment": None,
        QUESTIONS: [QUESTION_ROW],
        "from app.assessment_responses": [RESPONSE_ROW],
        "from app.competency_results": [RESULT_ROW],
        "from app.learning_path_items": [PATH_ROW],
        ASSESSMENT_BY_ID: ASSESSMENT_ROW,
        OPEN_ATTEMPT: ATTEMPT,
        ATTEMPT_BY_ID: ATTEMPT_ROW,
    }
    results.update(overrides)
    return FakeConnection(results=results)


# ---------------------------------------------------------------------------
# The catalogue
# ---------------------------------------------------------------------------


def test_a_learner_can_list_assessments():
    connection = FakeConnection(results={TOTAL: 1, ASSESSMENT_LIST: [ASSESSMENT_ROW]})
    client = build_client(connection)

    response = client.get("/api/v1/assessments", headers=LEARNER_HEADERS)

    assert response.status_code == 200
    assessment = response.json()["data"][0]
    assert assessment["title"] == "Grade 6 Mathematics Diagnostic Assessment"
    assert assessment["type"] == "diagnostic"
    assert assessment["total_questions"] == 2


def test_the_documented_assessment_filters_reach_the_query():
    connection = FakeConnection(results={TOTAL: 1, ASSESSMENT_LIST: [ASSESSMENT_ROW]})
    client = build_client(connection)

    client.get(
        "/api/v1/assessments",
        params={"type": "diagnostic", "grade_id": str(GRADE), "status": "published"},
        headers=ADVISER_HEADERS,
    )

    _, args = connection.calls[0]
    assert "diagnostic" in args
    assert GRADE in args
    assert "published" in args


def test_an_assessment_detail_never_carries_questions_or_an_answer_key():
    connection = FakeConnection(results={ASSESSMENT_BY_ID: ASSESSMENT_ROW})
    client = build_client(connection)

    response = client.get(f"/api/v1/assessments/{ASSESSMENT}", headers=LEARNER_HEADERS)

    assert response.status_code == 200
    body = response.text
    assert "questions" not in response.json()["data"]
    assert "answer_key" not in body


def test_an_assessment_the_caller_cannot_see_is_not_found():
    client = build_client(FakeConnection())

    response = client.get(f"/api/v1/assessments/{ASSESSMENT}", headers=LEARNER_HEADERS)

    assert response.status_code == 404


# ---------------------------------------------------------------------------
# Starting and resuming
# ---------------------------------------------------------------------------


def test_starting_an_attempt_delivers_questions_without_answers():
    connection = attempt_connection(**{OPEN_ATTEMPT: None})
    client = build_client(connection)

    response = client.post(
        f"/api/v1/assessments/{ASSESSMENT}/attempts", headers=LEARNER_HEADERS
    )

    assert response.status_code == 201
    data = response.json()["data"]
    assert data["attempt_id"] == str(ATTEMPT)
    question = data["questions"][0]
    assert question["text"] == "What is (-9) x (-8)?"
    assert question["choices"] == ["-72", "72", "-17", "17"]
    for forbidden in ("answer_key", "correct_answer", "explanation", "hint", "is_correct"):
        assert forbidden not in response.text


def test_a_repeated_start_resumes_rather_than_creating_a_second_attempt():
    connection = attempt_connection()
    client = build_client(connection)

    response = client.post(
        f"/api/v1/assessments/{ASSESSMENT}/attempts", headers=LEARNER_HEADERS
    )

    assert response.status_code == 200
    assert response.json()["data"]["saved_answers"] == {str(QUESTION): "72"}


def test_a_teacher_admin_does_not_sit_an_assessment():
    connection = attempt_connection()
    client = build_client(connection)

    response = client.post(
        f"/api/v1/assessments/{ASSESSMENT}/attempts", headers=ADVISER_HEADERS
    )

    assert response.status_code == 403
    assert not [c for c in connection.calls if "app.start_assessment_attempt" in c[0]]


# ---------------------------------------------------------------------------
# Autosave
# ---------------------------------------------------------------------------


def test_autosave_reports_what_was_saved():
    client = build_client(attempt_connection())

    response = client.patch(
        f"/api/v1/assessment-attempts/{ATTEMPT}",
        json={"answers": [{"question_id": str(QUESTION), "answer": "72"}]},
        headers=LEARNER_HEADERS,
    )

    assert response.status_code == 200
    assert response.json()["data"]["saved"] == 1


def test_autosave_sends_the_answers_as_one_json_document():
    connection = attempt_connection()
    client = build_client(connection)

    client.patch(
        f"/api/v1/assessment-attempts/{ATTEMPT}",
        json={"answers": [{"question_id": str(QUESTION), "answer": "72"}]},
        headers=LEARNER_HEADERS,
    )

    _query, args = next(
        call for call in connection.calls if "app.save_assessment_answers" in call[0]
    )
    assert args[0] == ATTEMPT
    assert '"question_id"' in args[1]


def test_an_autosave_request_cannot_name_a_learner():
    client = build_client(attempt_connection())

    response = client.patch(
        f"/api/v1/assessment-attempts/{ATTEMPT}",
        json={"answers": [], "student_id": str(STUDENT_ID)},
        headers=LEARNER_HEADERS,
    )

    assert response.status_code == 422
    assert "student_id" in response.json()["error"]["fields"]


# ---------------------------------------------------------------------------
# Submission
# ---------------------------------------------------------------------------


def test_submitting_returns_the_deterministic_report():
    client = build_client(attempt_connection())

    response = client.post(
        f"/api/v1/assessment-attempts/{ATTEMPT}/submit",
        json={"answers": [{"question_id": str(QUESTION), "answer": "72"}]},
        headers=LEARNER_HEADERS,
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["status"] == "scored"
    assert data["overall_score"] == 50
    assert data["competency_results"][0]["mastery_band"] == "Developing"
    assert data["recommended_learning_path"][0]["priority"] == 1
    assert data["next_action"]["type"]


def test_a_submission_never_discloses_an_answer_key():
    client = build_client(attempt_connection())

    response = client.post(
        f"/api/v1/assessment-attempts/{ATTEMPT}/submit",
        json={"answers": []},
        headers=LEARNER_HEADERS,
    )

    for forbidden in ("answer_key", "correct_answer"):
        assert forbidden not in response.text


def test_a_teacher_admin_does_not_submit_a_learners_attempt():
    connection = attempt_connection()
    client = build_client(connection)

    response = client.post(
        f"/api/v1/assessment-attempts/{ATTEMPT}/submit",
        json={"answers": []},
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 403
    assert not [c for c in connection.calls if "app.submit_assessment_attempt" in c[0]]


# ---------------------------------------------------------------------------
# Reading attempts
# ---------------------------------------------------------------------------


def test_an_attempt_can_be_read_back():
    client = build_client(attempt_connection())

    response = client.get(f"/api/v1/assessment-attempts/{ATTEMPT}", headers=LEARNER_HEADERS)

    assert response.status_code == 200
    assert response.json()["data"]["attempt_id"] == str(ATTEMPT)


def test_an_attempt_the_caller_cannot_see_is_not_found():
    """RLS returns nothing for another learner's attempt, and so does the API."""
    client = build_client(attempt_connection(**{ATTEMPT_BY_ID: None}))

    response = client.get(f"/api/v1/assessment-attempts/{ATTEMPT}", headers=LEARNER_HEADERS)

    assert response.status_code == 404


def test_a_teacher_admin_reads_a_learners_attempt_history():
    connection = FakeConnection(results={TOTAL: 1, HISTORY: [HISTORY_ROW]})
    client = build_client(connection)

    response = client.get(
        f"/api/v1/students/{STUDENT_ID}/assessment-attempts", headers=ADVISER_HEADERS
    )

    assert response.status_code == 200
    assert response.json()["data"][0]["attempt_id"] == str(ATTEMPT)


def test_a_learner_cannot_ask_for_another_learners_attempt_history():
    connection = FakeConnection(results={TOTAL: 1, HISTORY: [HISTORY_ROW]})
    client = build_client(connection)

    response = client.get(
        f"/api/v1/students/{STUDENT_ID}/assessment-attempts", headers=LEARNER_HEADERS
    )

    assert response.status_code == 403


def test_diagnostic_status_is_reported():
    connection = FakeConnection(
        results={
            "student_profiles.diagnostic_status": {
                "diagnostic_status": "completed",
                "latest_attempt_id": ATTEMPT,
                "latest_score": 63,
                "authorization_id": None,
            }
        }
    )
    client = build_client(connection)

    response = client.get(
        f"/api/v1/students/{STUDENT_ID}/diagnostic-status", headers=ADVISER_HEADERS
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["status"] == "completed"
    assert data["latest_score"] == 63
    assert data["reassessment_eligible"] is False


# ---------------------------------------------------------------------------
# Reassessment authorization
# ---------------------------------------------------------------------------


AUTHORIZATION_ROW = {
    "authorization_id": UUID("7c1f0000-0000-4000-8000-000000000001"),
    "student_id": STUDENT_ID,
    "assessment_id": ASSESSMENT,
    "reason": "Interrupted by a power cut during the diagnostic.",
    "granted_at": None,
    "expires_at": None,
}

AUTHORIZATION_BODY = {
    "assessment_id": str(ASSESSMENT),
    "reason": "Interrupted by a power cut during the diagnostic.",
}


def test_a_teacher_admin_can_authorise_a_reassessment():
    connection = attempt_connection(**{"app.authorize_reassessment": AUTHORIZATION_ROW})
    client = build_client(connection)

    response = client.post(
        f"/api/v1/students/{STUDENT_ID}/reassessment-authorizations",
        json=AUTHORIZATION_BODY,
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 201
    assert response.json()["data"]["reason"] == AUTHORIZATION_BODY["reason"]


def test_a_learner_cannot_authorise_their_own_reassessment():
    connection = attempt_connection(**{"app.authorize_reassessment": AUTHORIZATION_ROW})
    client = build_client(connection)

    response = client.post(
        f"/api/v1/students/{STUDENT_ID}/reassessment-authorizations",
        json=AUTHORIZATION_BODY,
        headers=LEARNER_HEADERS,
    )

    assert response.status_code == 403
    assert not [c for c in connection.calls if "app.authorize_reassessment" in c[0]]


def test_authorising_a_reassessment_needs_a_live_session():
    """A security-critical educator decision, so a signed-out token is refused."""
    connection = attempt_connection(**{"app.authorize_reassessment": AUTHORIZATION_ROW})
    client = build_client(connection, live_session=False)

    response = client.post(
        f"/api/v1/students/{STUDENT_ID}/reassessment-authorizations",
        json=AUTHORIZATION_BODY,
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "session_revoked"


@pytest.mark.parametrize(
    "path",
    [
        "/api/v1/assessments",
        f"/api/v1/assessments/{ASSESSMENT}",
        f"/api/v1/assessment-attempts/{ATTEMPT}",
    ],
)
def test_assessment_reads_need_a_token(path):
    client = build_client(FakeConnection())

    assert client.get(path).status_code == 401


# ---------------------------------------------------------------------------
# Bind parameters
# ---------------------------------------------------------------------------
# PostgreSQL infers a statement's parameter count from the highest-numbered
# `$n` it references, and every lower number must be referenced too or the bind
# is untyped and the statement is rejected (42P08). The fake connection never
# binds, so nothing else here would notice.


def test_the_assessment_count_binds_exactly_what_it_references():
    connection = FakeConnection(results={TOTAL: 1, ASSESSMENT_LIST: [ASSESSMENT_ROW]})
    client = build_client(connection)

    client.get(
        "/api/v1/assessments",
        params={"type": "diagnostic", "grade_id": str(GRADE)},
        headers=LEARNER_HEADERS,
    )

    assert connection.calls
    for statement, args in connection.calls:
        numbers = {int(number) for number in re.findall(r"\$(\d+)", statement)}
        highest = max(numbers, default=0)
        assert numbers == set(range(1, highest + 1)), statement
        assert len(args) == highest, statement
