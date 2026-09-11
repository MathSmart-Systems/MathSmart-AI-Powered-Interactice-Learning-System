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

import hashlib
import json
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
IDEMPOTENCY_KEY = "assessment-submit-0001"
SUBMISSION_HEADERS = {**LEARNER_HEADERS, "Idempotency-Key": IDEMPOTENCY_KEY}

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
    "resumed": False,
    "assessment_payload": {
        "id": str(ASSESSMENT),
        "title": "Grade 6 Mathematics Diagnostic Assessment",
        "type": "diagnostic",
        "duration_minutes": 30,
    },
    "result_payload": None,
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

CANONICAL_REPORT = {
    "attempt_id": str(ATTEMPT),
    "assessment_id": str(ASSESSMENT),
    "status": "scored",
    "overall_score": 50,
    "started_at": None,
    "submitted_at": None,
    "competency_results": [
        {
            "competency_id": str(COMPETENCY),
            "competency_name": "Multiplication and Division of Integers",
            "raw_score": 1,
            "max_score": 2,
            "percentage": 50,
            "mastery_band": "Developing",
        }
    ],
    "recommended_learning_path": [
        {
            "id": str(PATH_ITEM),
            "priority": 1,
            "reason": "Assessment score of 50% places this competency in the Developing band.",
            "status": "available",
            "competency": {
                "id": str(COMPETENCY),
                "code": "MATH6-INT-02",
                "name": "Multiplication and Division of Integers",
            },
            "module": {
                "id": str(MODULE),
                "title": "Multiplication and Division of Integers",
                "estimated_minutes": 15,
            },
        }
    ],
    "next_action": {"type": "learning_path", "label": "Start Your Learning Path"},
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
QUESTIONS = "order by assessment_responses.delivered_position"
HISTORY = "limit $2 offset $3"


def attempt_connection(**overrides):
    results = {
        "app.start_assessment_attempt": ATTEMPT_ROW,
        "app.save_assessment_answers": 1,
        "app.claim_assessment_submission_idempotency": {
            "claim_status": "claimed",
            "response_status": None,
            "response_body": None,
        },
        "app.submit_assessment_attempt": {
            **SCORED_ROW,
            "result_payload": CANONICAL_REPORT,
        },
        "app.complete_assessment_submission_idempotency": True,
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


def test_question_delivery_is_scoped_to_the_started_attempt_snapshot():
    connection = attempt_connection(**{OPEN_ATTEMPT: None})
    client = build_client(connection)

    response = client.post(
        f"/api/v1/assessments/{ASSESSMENT}/attempts", headers=LEARNER_HEADERS
    )

    assert response.status_code == 201
    _query, args = next(call for call in connection.calls if QUESTIONS in call[0])
    assert args == (ATTEMPT,)


def test_a_repeated_start_resumes_rather_than_creating_a_second_attempt():
    connection = attempt_connection(
        **{"app.start_assessment_attempt": {**ATTEMPT_ROW, "resumed": True}}
    )
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

    client = build_client(Refusing(results={OPEN_ATTEMPT: None}))

    response = client.post(
        f"/api/v1/assessments/{ASSESSMENT}/attempts", headers=LEARNER_HEADERS
    )

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "reassessment_not_authorized"


def test_a_wrong_grade_assessment_is_a_controlled_refusal():
    class WrongGrade(FakeConnection):
        async def fetchrow(self, query, *args):
            if "app.start_assessment_attempt" in query:
                raise asyncpg.RaiseError(
                    "This assessment is not available for your grade"
                )
            return await super().fetchrow(query, *args)

    client = build_client(WrongGrade(results={OPEN_ATTEMPT: None}))

    response = client.post(
        f"/api/v1/assessments/{ASSESSMENT}/attempts", headers=LEARNER_HEADERS
    )

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "assessment_grade_mismatch"


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


def test_expired_autosave_maps_to_conflict_without_writing_answers():
    class Expired(FakeConnection):
        async def fetchval(self, query, *args):
            if "app.save_assessment_answers" in query:
                error = asyncpg.RaiseError("This assessment attempt has expired")
                error.sqlstate = "P0005"
                raise error
            return await super().fetchval(query, *args)

    response = build_client(Expired(results=attempt_connection().results)).patch(
        f"/api/v1/assessment-attempts/{ATTEMPT}",
        json={"answers": [{"question_id": str(QUESTION), "answer": "72"}]},
        headers=LEARNER_HEADERS,
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "assessment_attempt_expired"
    assert response.json()["error"]["message"] == "This assessment attempt has expired"


def test_autosave_after_grade_change_is_a_controlled_refusal():
    class WrongGrade(FakeConnection):
        async def fetchval(self, query, *args):
            if "app.save_assessment_answers" in query:
                raise asyncpg.RaiseError(
                    "This assessment is not available for your grade"
                )
            return await super().fetchval(query, *args)

    response = build_client(WrongGrade(results=attempt_connection().results)).patch(
        f"/api/v1/assessment-attempts/{ATTEMPT}",
        json={"answers": []},
        headers=LEARNER_HEADERS,
    )

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "assessment_grade_mismatch"
    assert response.json()["error"]["message"] == (
        "This assessment is not available for your grade"
    )


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
    connection = attempt_connection()
    client = build_client(connection)

    response = client.post(
        f"/api/v1/assessment-attempts/{ATTEMPT}/submit",
        json={"answers": [{"question_id": str(QUESTION), "answer": "72"}]},
        headers=SUBMISSION_HEADERS,
    )

    assert response.status_code == 200
    assert any(
        "app.complete_assessment_submission_idempotency" in query
        for query, _args in connection.calls
    )
    data = response.json()["data"]
    assert data["status"] == "scored"
    assert data["overall_score"] == 50
    assert data["competency_results"][0]["mastery_band"] == "Developing"
    assert data["recommended_learning_path"][0]["priority"] == 1
    assert data["next_action"]["type"]


def test_submission_trusts_only_the_report_frozen_by_scoring():
    authoritative = {**CANONICAL_REPORT, "overall_score": 75}
    connection = attempt_connection(
        **{
            "app.submit_assessment_attempt": {
                **SCORED_ROW,
                "result_payload": authoritative,
            }
        }
    )
    client = build_client(connection)

    response = client.post(
        f"/api/v1/assessment-attempts/{ATTEMPT}/submit",
        json={"answers": []},
        headers=SUBMISSION_HEADERS,
    )

    assert response.status_code == 200
    assert response.json()["data"]["overall_score"] == 75
    assert not [
        call for call in connection.calls
        if "store_assessment_result_payload" in call[0]
    ]


def test_malformed_frozen_report_maps_to_a_sanitized_recording_failure():
    connection = attempt_connection(
        **{
            "app.submit_assessment_attempt": {
                **SCORED_ROW,
                "result_payload": {"attempt_id": "not-a-uuid"},
            }
        }
    )
    client = build_client(connection)

    response = client.post(
        f"/api/v1/assessment-attempts/{ATTEMPT}/submit",
        json={"answers": []},
        headers=SUBMISSION_HEADERS,
    )

    assert response.status_code == 500
    assert response.json()["error"]["code"] == "assessment_result_recording_failed"
    assert "uuid" not in response.text.lower()


def test_a_submission_never_discloses_an_answer_key():
    client = build_client(attempt_connection())

    response = client.post(
        f"/api/v1/assessment-attempts/{ATTEMPT}/submit",
        json={"answers": []},
        headers=SUBMISSION_HEADERS,
    )

    for forbidden in ("answer_key", "correct_answer"):
        assert forbidden not in response.text


def test_a_teacher_admin_does_not_submit_a_learners_attempt():
    connection = attempt_connection()
    client = build_client(connection)

    response = client.post(
        f"/api/v1/assessment-attempts/{ATTEMPT}/submit",
        json={"answers": []},
        headers={**ADVISER_HEADERS, "Idempotency-Key": IDEMPOTENCY_KEY},
    )

    assert response.status_code == 403
    assert not [c for c in connection.calls if "app.submit_assessment_attempt" in c[0]]


@pytest.mark.parametrize("key", [None, "short", "        ", "x" * 256])
def test_submission_requires_a_valid_length_idempotency_key(key):
    connection = attempt_connection()
    client = build_client(connection)
    headers = dict(LEARNER_HEADERS)
    if key is not None:
        headers["Idempotency-Key"] = key

    response = client.post(
        f"/api/v1/assessment-attempts/{ATTEMPT}/submit",
        json={"answers": []},
        headers=headers,
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "idempotency_key_required"
    assert not [c for c in connection.calls if "claim_assessment_submission" in c[0]]


def test_submission_replay_returns_the_exact_stored_body_and_status_without_grading():
    stored_body = {
        "data": {
            "attempt_id": str(ATTEMPT),
            "assessment_id": str(ASSESSMENT),
            "status": "scored",
            "overall_score": 50.0,
            "marker": "stored-exactly",
        }
    }
    connection = attempt_connection(
        **{
            "app.claim_assessment_submission_idempotency": {
                "claim_status": "replay",
                "response_status": 202,
                "response_body": stored_body,
            }
        }
    )
    client = build_client(connection)

    response = client.post(
        f"/api/v1/assessment-attempts/{ATTEMPT}/submit",
        json={"answers": [{"question_id": str(QUESTION), "answer": "72"}]},
        headers=SUBMISSION_HEADERS,
    )

    assert response.status_code == 202
    assert response.json() == stored_body
    assert not [c for c in connection.calls if "app.submit_assessment_attempt" in c[0]]
    assert not [c for c in connection.calls if "complete_assessment_submission" in c[0]]


@pytest.mark.parametrize("claim", [None, {"claim_status": "unexpected"}])
def test_submission_fails_closed_for_an_invalid_idempotency_claim(claim):
    connection = attempt_connection(
        **{"app.claim_assessment_submission_idempotency": claim}
    )
    client = build_client(connection)

    response = client.post(
        f"/api/v1/assessment-attempts/{ATTEMPT}/submit",
        json={"answers": []},
        headers=SUBMISSION_HEADERS,
    )

    assert response.status_code == 500
    assert response.json()["error"]["code"] == "idempotency_claim_failed"
    assert not [c for c in connection.calls if "app.submit_assessment_attempt" in c[0]]


@pytest.mark.parametrize(
    ("status", "body"),
    [(None, {"data": {}}), (200, None), ("200", {"data": {}})],
)
def test_submission_fails_closed_for_an_invalid_stored_replay(status, body):
    connection = attempt_connection(
        **{
            "app.claim_assessment_submission_idempotency": {
                "claim_status": "replay",
                "response_status": status,
                "response_body": body,
            }
        }
    )
    client = build_client(connection)

    response = client.post(
        f"/api/v1/assessment-attempts/{ATTEMPT}/submit",
        json={"answers": []},
        headers=SUBMISSION_HEADERS,
    )

    assert response.status_code == 500
    assert response.json()["error"]["code"] == "idempotency_replay_invalid"
    assert not [c for c in connection.calls if "app.submit_assessment_attempt" in c[0]]


def test_reusing_a_submission_key_for_a_different_request_is_a_conflict():
    connection = attempt_connection(
        **{
            "app.claim_assessment_submission_idempotency": {
                "claim_status": "conflict",
                "response_status": None,
                "response_body": None,
            }
        }
    )
    client = build_client(connection)

    response = client.post(
        f"/api/v1/assessment-attempts/{ATTEMPT}/submit",
        json={"answers": []},
        headers=SUBMISSION_HEADERS,
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "idempotency_key_reused"
    assert not [c for c in connection.calls if "app.submit_assessment_attempt" in c[0]]


def test_submit_after_grade_change_is_a_controlled_refusal():
    class WrongGrade(FakeConnection):
        async def fetchrow(self, query, *args):
            if "app.submit_assessment_attempt" in query:
                raise asyncpg.RaiseError(
                    "This assessment is not available for your grade"
                )
            return await super().fetchrow(query, *args)

    connection = WrongGrade(results=attempt_connection().results)
    response = build_client(connection).post(
        f"/api/v1/assessment-attempts/{ATTEMPT}/submit",
        json={"answers": []},
        headers=SUBMISSION_HEADERS,
    )

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "assessment_grade_mismatch"
    assert response.json()["error"]["message"] == (
        "This assessment is not available for your grade"
    )
    assert not [c for c in connection.calls if "complete_assessment_submission" in c[0]]


def test_a_completed_attempt_with_a_new_key_returns_a_controlled_conflict():
    class FinishedAttempt(FakeConnection):
        async def fetchrow(self, query, *args):
            if "app.submit_assessment_attempt" in query:
                raise asyncpg.NoDataFoundError("No attempt of yours is in progress")
            return await super().fetchrow(query, *args)

    connection = FinishedAttempt(results=attempt_connection().results)
    client = build_client(connection)

    response = client.post(
        f"/api/v1/assessment-attempts/{ATTEMPT}/submit",
        json={"answers": []},
        headers={**LEARNER_HEADERS, "Idempotency-Key": "a-different-valid-key"},
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "assessment_attempt_not_in_progress"
    assert not [c for c in connection.calls if "complete_assessment_submission" in c[0]]


def test_an_unrecorded_idempotency_completion_fails_closed():
    connection = attempt_connection(
        **{"app.complete_assessment_submission_idempotency": False}
    )
    client = build_client(connection)

    response = client.post(
        f"/api/v1/assessment-attempts/{ATTEMPT}/submit",
        json={"answers": []},
        headers=SUBMISSION_HEADERS,
    )

    assert response.status_code == 500
    assert response.json()["error"]["code"] == "idempotency_completion_failed"


def test_submission_fingerprint_contains_attempt_and_ordered_validated_answers():
    connection = attempt_connection()
    client = build_client(connection)

    response = client.post(
        f"/api/v1/assessment-attempts/{ATTEMPT}/submit",
        json={"answers": [{"answer": "72", "question_id": str(QUESTION)}]},
        headers=SUBMISSION_HEADERS,
    )

    assert response.status_code == 200
    _query, claim_args = next(
        call for call in connection.calls if "claim_assessment_submission" in call[0]
    )
    _query, complete_args = next(
        call for call in connection.calls if "complete_assessment_submission" in call[0]
    )
    expected_canonical = json.dumps(
        {
            "attempt_id": str(ATTEMPT),
            "answers": [{"question_id": str(QUESTION), "answer": "72"}],
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    assert claim_args == (
        IDEMPOTENCY_KEY,
        hashlib.sha256(expected_canonical.encode()).hexdigest(),
    )
    assert re.fullmatch(r"[0-9a-f]{64}", claim_args[1])
    assert complete_args[:3] == (IDEMPOTENCY_KEY, claim_args[1], 200)
    assert response.json() == json.loads(complete_args[3])


# ---------------------------------------------------------------------------
# Reading attempts
# ---------------------------------------------------------------------------


def test_an_attempt_can_be_read_back():
    client = build_client(attempt_connection())

    response = client.get(f"/api/v1/assessment-attempts/{ATTEMPT}", headers=LEARNER_HEADERS)

    assert response.status_code == 200
    assert response.json()["data"]["attempt_id"] == str(ATTEMPT)


def test_a_scored_attempt_read_back_returns_its_stored_immutable_report():
    stored = CANONICAL_REPORT
    scored = {**SCORED_ROW, "result_payload": stored}
    client = build_client(attempt_connection(**{ATTEMPT_BY_ID: scored}))

    response = client.get(f"/api/v1/assessment-attempts/{ATTEMPT}", headers=LEARNER_HEADERS)

    assert response.status_code == 200
    assert response.json()["data"] == stored



def test_a_backfilled_report_is_read_without_mutable_reconstruction_queries():
    backfilled = {
        **CANONICAL_REPORT,
        "recommended_learning_path": [],
        "next_action": {"type": "dashboard", "label": "Return to Dashboard"},
    }
    scored = {**SCORED_ROW, "result_payload": backfilled}
    connection = attempt_connection(**{ATTEMPT_BY_ID: scored})

    response = build_client(connection).get(
        f"/api/v1/assessment-attempts/{ATTEMPT}", headers=LEARNER_HEADERS
    )

    assert response.status_code == 200
    assert response.json()["data"] == backfilled
    assert len(connection.calls) == 1
    query = connection.calls[0][0]
    assert "from app.competency_results" not in query
    assert "from app.learning_path_items" not in query
    assert "from app.assessment_responses" not in query
    assert "from app.questions" not in query


def test_a_malformed_stored_report_is_a_sanitized_recording_failure():
    scored = {**SCORED_ROW, "result_payload": {"attempt_id": "invalid"}}
    client = build_client(attempt_connection(**{ATTEMPT_BY_ID: scored}))

    response = client.get(f"/api/v1/assessment-attempts/{ATTEMPT}", headers=LEARNER_HEADERS)

    assert response.status_code == 500
    assert response.json()["error"]["code"] == "assessment_result_recording_failed"
    assert "uuid" not in response.text.lower()


def test_a_legacy_scored_attempt_without_a_stored_report_is_controlled():
    client = build_client(attempt_connection(**{ATTEMPT_BY_ID: SCORED_ROW}))

    response = client.get(f"/api/v1/assessment-attempts/{ATTEMPT}", headers=LEARNER_HEADERS)

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "assessment_result_unavailable"


def test_an_attempt_the_caller_cannot_see_is_not_found():
    """RLS returns nothing for another learner's attempt, and so does the API."""
    client = build_client(attempt_connection(**{ATTEMPT_BY_ID: None}))

    response = client.get(f"/api/v1/assessment-attempts/{ATTEMPT}", headers=LEARNER_HEADERS)

    assert response.status_code == 404


def test_a_learner_reads_their_own_attempt_history():
    connection = FakeConnection(
        results={
            "where student_profiles.user_id = $1": STUDENT_ID,
            TOTAL: 1,
            HISTORY: [HISTORY_ROW],
        }
    )
    client = build_client(connection)

    response = client.get("/api/v1/assessment-attempts/me", headers=LEARNER_HEADERS)

    assert response.status_code == 200
    assert response.json()["data"][0]["attempt_id"] == str(ATTEMPT)
    history_call = next(call for call in connection.calls if HISTORY in call[0])
    assert history_call[1] == (STUDENT_ID, 20, 0)


def test_own_attempt_history_paginates_with_the_derived_student():
    connection = FakeConnection(
        results={
            "where student_profiles.user_id = $1": STUDENT_ID,
            TOTAL: 45,
            HISTORY: [HISTORY_ROW],
        }
    )
    client = build_client(connection)

    response = client.get(
        "/api/v1/assessment-attempts/me?page=3&page_size=10", headers=LEARNER_HEADERS
    )

    assert response.status_code == 200
    assert response.json()["meta"] == {
        "page": 3,
        "page_size": 10,
        "total_items": 45,
        "total_pages": 5,
    }
    history_call = next(call for call in connection.calls if HISTORY in call[0])
    assert history_call[1] == (STUDENT_ID, 10, 20)


def test_a_non_student_cannot_read_own_attempt_history():
    connection = FakeConnection()
    client = build_client(connection)

    response = client.get("/api/v1/assessment-attempts/me", headers=ADVISER_HEADERS)

    assert response.status_code == 403
    assert not connection.calls


def test_own_attempt_history_requires_a_learner_profile():
    connection = FakeConnection(results={"where student_profiles.user_id = $1": None})
    client = build_client(connection)

    response = client.get("/api/v1/assessment-attempts/me", headers=LEARNER_HEADERS)

    assert response.status_code == 403
    assert not [call for call in connection.calls if HISTORY in call[0]]


def test_own_history_cannot_be_scoped_to_another_student():
    connection = FakeConnection(
        results={
            "where student_profiles.user_id = $1": STUDENT_ID,
            TOTAL: 0,
            HISTORY: [],
        }
    )
    client = build_client(connection)

    response = client.get(
        "/api/v1/assessment-attempts/me",
        params={"student_id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"},
        headers=LEARNER_HEADERS,
    )

    assert response.status_code == 200
    history_call = next(call for call in connection.calls if HISTORY in call[0])
    assert history_call[1][0] == STUDENT_ID


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


def diagnostic_status_connection(*, eligible=False, own_student_id=STUDENT_ID):
    return FakeConnection(
        results={
            "where student_profiles.user_id = $1": own_student_id,
            "student_profiles.diagnostic_status": {
                "diagnostic_status": "completed",
                "assessment_id": ASSESSMENT,
                "latest_attempt_id": ATTEMPT,
                "latest_status": "scored",
                "latest_score": 63,
                "reassessment_eligible": eligible,
            },
        }
    )


def test_a_learner_reads_their_own_diagnostic_status_without_an_id():
    connection = diagnostic_status_connection(eligible=True)
    client = build_client(connection)

    response = client.get("/api/v1/diagnostic-status/me", headers=LEARNER_HEADERS)

    assert response.status_code == 200
    assert response.json()["data"]["status"] == "completed"
    assert response.json()["data"]["reassessment_eligible"] is True


def test_own_diagnostic_status_is_correlated_to_the_selected_assessment():
    selected = UUID("fa000000-0000-4000-8000-000000000099")
    connection = diagnostic_status_connection()
    connection.results["student_profiles.diagnostic_status"] = {
        "diagnostic_status": "not_started",
        "assessment_id": selected,
        "latest_attempt_id": None,
        "latest_status": None,
        "latest_score": None,
        "reassessment_eligible": False,
    }
    client = build_client(connection)

    response = client.get(
        "/api/v1/diagnostic-status/me",
        params={"assessment_id": str(selected)},
        headers=LEARNER_HEADERS,
    )

    assert response.status_code == 200
    assert response.json()["data"] == {
        "status": "not_started",
        "assessment_id": str(selected),
        "latest_attempt_id": None,
        "latest_status": None,
        "latest_score": None,
        "reassessment_eligible": False,
        "reassessment_reason": None,
    }
    status_call = next(
        call for call in connection.calls if "student_profiles.diagnostic_status" in call[0]
    )
    assert status_call[1] == (STUDENT_ID, selected)


def test_own_diagnostic_status_requires_a_learner_profile():
    client = build_client(diagnostic_status_connection(own_student_id=None))

    response = client.get("/api/v1/diagnostic-status/me", headers=LEARNER_HEADERS)

    assert response.status_code == 403


def test_diagnostic_status_is_reported_to_a_teacher_admin():
    client = build_client(diagnostic_status_connection())

    response = client.get(
        f"/api/v1/students/{STUDENT_ID}/diagnostic-status", headers=ADVISER_HEADERS
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["status"] == "completed"
    assert data["latest_score"] == 63
    assert data["reassessment_eligible"] is False


def test_named_diagnostic_status_accepts_the_same_assessment_scope():
    selected = UUID("fa000000-0000-4000-8000-000000000099")
    connection = diagnostic_status_connection()
    connection.results["student_profiles.diagnostic_status"] = {
        "diagnostic_status": "not_started",
        "assessment_id": selected,
        "latest_attempt_id": None,
        "latest_status": None,
        "latest_score": None,
        "reassessment_eligible": False,
    }
    client = build_client(connection)

    response = client.get(
        f"/api/v1/students/{STUDENT_ID}/diagnostic-status",
        params={"assessment_id": str(selected)},
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 200
    assert response.json()["data"]["status"] == "not_started"
    status_call = next(
        call for call in connection.calls if "student_profiles.diagnostic_status" in call[0]
    )
    assert status_call[1] == (STUDENT_ID, selected)


def test_a_learner_can_read_their_own_authorized_reassessment_status():
    client = build_client(diagnostic_status_connection(eligible=True))

    response = client.get(
        f"/api/v1/students/{STUDENT_ID}/diagnostic-status", headers=LEARNER_HEADERS
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["reassessment_eligible"] is True
    assert data["reassessment_reason"] == (
        "A Teacher/Administrator has authorised a reassessment."
    )


def test_a_learner_cannot_read_another_learners_diagnostic_status():
    client = build_client(diagnostic_status_connection(own_student_id=None))

    response = client.get(
        f"/api/v1/students/{STUDENT_ID}/diagnostic-status", headers=LEARNER_HEADERS
    )

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
        "/api/v1/assessment-attempts/me",
        "/api/v1/diagnostic-status/me",
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
