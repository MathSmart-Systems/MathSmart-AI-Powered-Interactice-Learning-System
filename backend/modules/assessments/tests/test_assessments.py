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

import asyncpg
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
    # A catalogue column now: whether starting this paper would actually
    # succeed, which `status` alone never said.
    "is_ready": True,
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

# One reviewed item, as the closed-paper read returns it. Note what is not
# here: there is no correct answer and no key, because the column that holds
# them is not granted to this connection.
REVIEW_ROW = {
    "question_id": QUESTION,
    "position": 1,
    "competency_id": COMPETENCY,
    "competency_name": "Multiplication and Division of Integers",
    "text": "What is (-9) x (-8)?",
    "question_type": "number_input",
    "choices": "[]",
    "answer": '"64"',
    "is_correct": False,
}

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
# The catalogue now derives the caller's standing from their attempts, so it
# mentions both the status predicate and the attempt id this query selects.
# Neither is an anchor any more. The parameter position is: the open-attempt
# lookup takes the user id as $2, and every catalogue subquery takes it as $1.
OPEN_ATTEMPT = "and student_profiles.user_id = $2"
ATTEMPT_BY_ID = "where assessment_attempts.attempt_id = $1"
ASSESSMENT_BY_ID = "where assessments.assessment_id"
ASSESSMENT_LIST = "order by assessments.title"
TOTAL = "count(*) as total"
QUESTIONS = "order by assessment_questions.position"
# What one attempt was actually given, frozen against it when it began.
# Delivery reads this rather than the assessment's current membership, so the
# two anchors have to stay apart.
DELIVERED = "order by assessment_responses.delivered_position"
SAVED = "select assessment_responses.question_id, assessment_responses.answer"
HISTORY = "limit $2 offset $3"
# The year-group check the detail and start routes run before anything else. A
# learner whose grade does not match the paper is told it was not found, so the
# fakes have to answer it or every one of those routes reads as missing.
LEARNER_GRADE = "select student_profiles.grade_id"
REVIEW = "order by assessment_responses.delivered_position"


def attempt_connection(**overrides):
    results = {
        "app.start_assessment_attempt": ATTEMPT_ROW,
        "app.save_assessment_answers": 1,
        "app.submit_assessment_attempt": SCORED_ROW,
        "app.authorize_reassessment": None,
        QUESTIONS: [QUESTION_ROW],
        DELIVERED: [QUESTION_ROW],
        SAVED: [RESPONSE_ROW],
        "from app.assessment_responses": [RESPONSE_ROW],
        "from app.competency_results": [RESULT_ROW],
        "from app.learning_path_items": [PATH_ROW],
        ASSESSMENT_BY_ID: ASSESSMENT_ROW,
        OPEN_ATTEMPT: ATTEMPT,
        ATTEMPT_BY_ID: ATTEMPT_ROW,
        LEARNER_GRADE: GRADE,
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
    connection = FakeConnection(
        results={ASSESSMENT_BY_ID: ASSESSMENT_ROW, LEARNER_GRADE: GRADE}
    )
    client = build_client(connection)

    response = client.get(f"/api/v1/assessments/{ASSESSMENT}", headers=LEARNER_HEADERS)

    assert response.status_code == 200
    body = response.text
    assert "questions" not in response.json()["data"]
    assert "answer_key" not in body


def test_an_assessment_from_another_year_group_is_not_found():
    """Typing the identifier is not authorization.

    404 rather than 403 on purpose: a learner who could tell "forbidden" from
    "missing" could walk the assessment table one identifier at a time and
    learn what other year groups are being set.
    """
    connection = FakeConnection(
        results={
            ASSESSMENT_BY_ID: ASSESSMENT_ROW,
            LEARNER_GRADE: UUID("3f0f0000-0000-4000-8000-000000000007"),
        }
    )
    client = build_client(connection)

    response = client.get(f"/api/v1/assessments/{ASSESSMENT}", headers=LEARNER_HEADERS)

    assert response.status_code == 404


def test_a_learner_with_no_profile_cannot_open_an_assessment():
    connection = FakeConnection(
        results={ASSESSMENT_BY_ID: ASSESSMENT_ROW, LEARNER_GRADE: None}
    )
    client = build_client(connection)

    response = client.get(f"/api/v1/assessments/{ASSESSMENT}", headers=LEARNER_HEADERS)

    assert response.status_code == 404


def test_another_year_groups_assessment_cannot_be_started():
    connection = attempt_connection(
        **{LEARNER_GRADE: UUID("3f0f0000-0000-4000-8000-000000000007")}
    )
    client = build_client(connection)

    response = client.post(
        f"/api/v1/assessments/{ASSESSMENT}/attempts", headers=LEARNER_HEADERS
    )

    assert response.status_code == 404
    assert not any(
        "app.start_assessment_attempt" in query for query, _ in connection.calls
    ), "the refusal has to come before anything is written"


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


def test_a_retake_without_authorisation_is_refused_rather_than_failing():
    """The database refuses it with 42501; the caller must not see a 500."""

    class Refusing(FakeConnection):
        async def fetchrow(self, query, *args):
            if "app.start_assessment_attempt" in query:
                raise asyncpg.InsufficientPrivilegeError(
                    "A reassessment needs an authorization"
                )
            return await super().fetchrow(query, *args)

    client = build_client(
        Refusing(
            results={
                OPEN_ATTEMPT: None,
                ASSESSMENT_BY_ID: ASSESSMENT_ROW,
                LEARNER_GRADE: GRADE,
            }
        )
    )

    response = client.post(
        f"/api/v1/assessments/{ASSESSMENT}/attempts", headers=LEARNER_HEADERS
    )

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "reassessment_not_authorized"


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
# Learner own attempt history (/assessment-attempts/me)
# ---------------------------------------------------------------------------

OWN_STUDENT = "where student_profiles.user_id = $1"
DIAG_STATUS = "student_profiles.diagnostic_status"


def _me_history_connection(**overrides):
    results = {
        OWN_STUDENT: STUDENT_ID,
        TOTAL: 1,
        HISTORY: [HISTORY_ROW],
    }
    results.update(overrides)
    return FakeConnection(results=results)


def test_a_learner_reads_own_attempt_history():
    """GET /assessment-attempts/me returns the caller's history without naming a student."""
    client = build_client(_me_history_connection())

    response = client.get("/api/v1/assessment-attempts/me", headers=LEARNER_HEADERS)

    assert response.status_code == 200
    data = response.json()["data"]
    assert data[0]["attempt_id"] == str(ATTEMPT)
    assert data[0]["title"] == "Grade 6 Mathematics Diagnostic Assessment"


def test_own_attempt_history_pagination_meta_is_correct():
    client = build_client(_me_history_connection())

    response = client.get(
        "/api/v1/assessment-attempts/me",
        params={"page": 1, "page_size": 5},
        headers=LEARNER_HEADERS,
    )

    meta = response.json()["meta"]
    assert meta["total_items"] == 1
    assert meta["total_pages"] == 1
    assert meta["page"] == 1


def test_own_attempt_history_is_empty_when_no_attempts_exist():
    connection = FakeConnection(results={OWN_STUDENT: STUDENT_ID, TOTAL: 0, HISTORY: []})
    client = build_client(connection)

    response = client.get("/api/v1/assessment-attempts/me", headers=LEARNER_HEADERS)

    assert response.status_code == 200
    assert response.json()["data"] == []
    assert response.json()["meta"]["total_items"] == 0


def test_teacher_admin_cannot_read_own_attempt_history_via_me():
    """The /me routes belong to learners; a Teacher/Administrator is refused."""
    client = build_client(_me_history_connection())

    response = client.get("/api/v1/assessment-attempts/me", headers=ADVISER_HEADERS)

    assert response.status_code == 403


def test_learner_without_a_profile_is_refused_on_attempt_history_me():
    """``own_student_id`` returns None when the profile does not exist; route returns 403."""
    connection = FakeConnection(results={OWN_STUDENT: None, TOTAL: 0, HISTORY: []})
    client = build_client(connection)

    response = client.get("/api/v1/assessment-attempts/me", headers=LEARNER_HEADERS)

    assert response.status_code == 403


# ---------------------------------------------------------------------------
# Learner own diagnostic status (/diagnostic-status/me)
# ---------------------------------------------------------------------------


def _me_status_connection(*, authorization_id=None, **overrides):
    results = {
        OWN_STUDENT: STUDENT_ID,
        DIAG_STATUS: {
            "diagnostic_status": "completed",
            "latest_attempt_id": ATTEMPT,
            "latest_score": 75,
            "authorization_id": authorization_id,
        },
    }
    results.update(overrides)
    return FakeConnection(results=results)


def test_a_learner_reads_own_diagnostic_status():
    """GET /diagnostic-status/me returns the caller's standing without naming a student."""
    client = build_client(_me_status_connection())

    response = client.get("/api/v1/diagnostic-status/me", headers=LEARNER_HEADERS)

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["status"] == "completed"
    assert data["latest_score"] == 75
    assert data["reassessment_eligible"] is False
    assert data["reassessment_reason"] is None


def test_own_diagnostic_status_shows_reassessment_eligible_when_authorised():
    auth_id = UUID("7c1f0000-0000-4000-8000-000000000001")
    client = build_client(_me_status_connection(authorization_id=auth_id))

    response = client.get("/api/v1/diagnostic-status/me", headers=LEARNER_HEADERS)

    data = response.json()["data"]
    assert data["reassessment_eligible"] is True
    assert data["reassessment_reason"] is not None


def test_teacher_admin_cannot_read_own_diagnostic_status_via_me():
    client = build_client(_me_status_connection())

    response = client.get("/api/v1/diagnostic-status/me", headers=ADVISER_HEADERS)

    assert response.status_code == 403


def test_learner_without_a_profile_is_refused_on_diagnostic_status_me():
    connection = FakeConnection(results={OWN_STUDENT: None})
    client = build_client(connection)

    response = client.get("/api/v1/diagnostic-status/me", headers=LEARNER_HEADERS)

    assert response.status_code == 403


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

    response = client.get(
        "/api/v1/assessments",
        params={"type": "diagnostic", "grade_id": str(GRADE)},
        headers=LEARNER_HEADERS,
    )

    # The listing alone would satisfy a bare `assert connection.calls`, and the
    # count is the statement this test is about, so it is named.
    assert response.status_code == 200
    assert any(TOTAL in statement for statement, _ in connection.calls)
    meta = response.json()["meta"]
    assert meta["total_items"] == 1
    assert meta["total_pages"] == 1
    for statement, args in connection.calls:
        numbers = {int(number) for number in re.findall(r"\$(\d+)", statement)}
        highest = max(numbers, default=0)
        assert numbers == set(range(1, highest + 1)), statement
        assert len(args) == highest, statement


# ---------------------------------------------------------------------------
# Reviewing a closed paper
# ---------------------------------------------------------------------------
def test_a_closed_attempt_can_be_reviewed_question_by_question():
    """A score on its own teaches nothing; the learner needs the items back."""
    connection = attempt_connection(**{ATTEMPT_BY_ID: SCORED_ROW, REVIEW: [REVIEW_ROW]})
    client = build_client(connection)

    response = client.get(
        f"/api/v1/assessment-attempts/{ATTEMPT}/review", headers=LEARNER_HEADERS
    )

    assert response.status_code == 200
    body = response.json()
    assert body["meta"]["reviewable"] is True
    item = body["data"][0]
    assert item["question_id"] == str(QUESTION)
    assert item["is_correct"] is False
    assert item["submitted_answer"] == "64"
    assert item["text"] == "What is (-9) x (-8)?"


def test_a_review_never_discloses_the_correct_answer():
    """The verdict is the whole of what a review may add.

    Telling a learner which item was wrong is reviewing the paper. Telling them
    what the answer was is handing over the key before the retake, and the
    column it lives in is not granted to this connection at all.
    """
    connection = attempt_connection(**{ATTEMPT_BY_ID: SCORED_ROW, REVIEW: [REVIEW_ROW]})
    client = build_client(connection)

    response = client.get(
        f"/api/v1/assessment-attempts/{ATTEMPT}/review", headers=LEARNER_HEADERS
    )

    body = response.text
    for forbidden in ("answer_key", "grading_answer_key", "correct_answer"):
        assert forbidden not in body
    assert "72" not in body, "the key for this question must not appear anywhere"

    assert not any(
        "grading_answer_key" in query for query, _ in connection.calls
    ), "no statement may even name the key column"


def test_an_open_attempt_has_nothing_to_review():
    """Mid-paper verdicts would turn the assessment into a quiz with a tutor.

    The statement itself filters on a closed status, so an open attempt simply
    returns no rows rather than being refused — the paper exists, it is just
    not finished.
    """
    connection = attempt_connection(**{ATTEMPT_BY_ID: ATTEMPT_ROW, REVIEW: []})
    client = build_client(connection)

    response = client.get(
        f"/api/v1/assessment-attempts/{ATTEMPT}/review", headers=LEARNER_HEADERS
    )

    assert response.status_code == 200
    assert response.json()["data"] == []
    assert response.json()["meta"]["reviewable"] is False


def test_a_review_of_an_attempt_that_is_not_there_is_not_found():
    client = build_client(FakeConnection())

    response = client.get(
        f"/api/v1/assessment-attempts/{ATTEMPT}/review", headers=LEARNER_HEADERS
    )

    assert response.status_code == 404


def test_the_catalogue_says_whether_the_caller_may_open_each_paper():
    """Decided once in SQL rather than guessed by every client from a status."""
    connection = FakeConnection(
        results={
            TOTAL: 1,
            ASSESSMENT_LIST: [{**ASSESSMENT_ROW, "availability": "reassessment"}],
        }
    )
    client = build_client(connection)

    response = client.get("/api/v1/assessments", headers=LEARNER_HEADERS)

    assert response.status_code == 200
    assert response.json()["data"][0]["availability"] == "reassessment"


def test_a_paper_nobody_can_open_is_reported_not_ready():
    """`published` was never the same claim as "a learner can sit this".

    An assessment with no questions, or holding a question whose own competency
    is still a draft, passed for live in every catalogue while
    `app.start_assessment_attempt` refused every learner who opened it. The
    availability the catalogue reports is the one the start would give, so the
    card can say "not ready" instead of inviting somebody into a refusal.
    """
    connection = FakeConnection(
        results={
            TOTAL: 1,
            ASSESSMENT_LIST: [
                {**ASSESSMENT_ROW, "is_ready": False, "availability": "not_ready"}
            ],
        }
    )
    client = build_client(connection)

    response = client.get("/api/v1/assessments", headers=LEARNER_HEADERS)

    assert response.status_code == 200
    paper = response.json()["data"][0]
    assert paper["status"] == "published"
    assert paper["is_ready"] is False
    assert paper["availability"] == "not_ready"


def test_the_assessment_detail_carries_the_same_readiness_as_the_list():
    """One answer, so a detail page cannot contradict the card that opened it."""
    connection = FakeConnection(
        results={
            ASSESSMENT_BY_ID: {
                **ASSESSMENT_ROW,
                "is_ready": False,
                "availability": "not_ready",
            },
            LEARNER_GRADE: GRADE,
        }
    )
    client = build_client(connection)

    response = client.get(f"/api/v1/assessments/{ASSESSMENT}", headers=LEARNER_HEADERS)

    assert response.status_code == 200
    assert response.json()["data"]["is_ready"] is False
    assert response.json()["data"]["availability"] == "not_ready"
