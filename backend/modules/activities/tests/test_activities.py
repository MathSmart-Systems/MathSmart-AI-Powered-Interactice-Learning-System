"""Activity routes.

An activity gives feedback while the learner is still working, so the two
things worth guarding are what comes back and who may ask. The verdict, the
authored explanation and the hint all come from database functions that read
columns the API connection cannot select; the answer key is never among them.

The arithmetic, the pass decision and the intervention trigger are proved
against PostgreSQL in
`supabase/tests/540_activity_attempt_functions_test.sql`.

The advisory hint wording is proved here with a stand-in adapter. Nothing in
this file reaches Groq: a live advisory request would be a paid call, and what
is worth proving is what a learner gets when that call is off, silent or
broken, which no live call can demonstrate on demand.
"""

import re
from datetime import UTC, datetime
from uuid import UUID

import asyncpg
import pytest

from modules.shared.groq_adapter import AdvisoryResult
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
SAVED = "select activity_responses.question_id, activity_responses.answer"
# The questions one open attempt was frozen with, which delivery prefers over
# the activity's current membership.
DELIVERED = "order by activity_responses.delivered_position"

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
    # Both are catalogue columns now: how many questions the activity holds and
    # whether starting it would actually succeed.
    "question_count": 1,
    "is_ready": True,
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

AUTHORED_HINT = "Check the signs before multiplying the magnitudes."

# The statement `_is_groq_feature_enabled` runs to read the database feature
# flag, as a fragment the fake connection can key on.
GROQ_FLAG = "app.groq_advisory_enabled()"

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


class FakeAdviser:
    """The Groq adapter's contract without the network or the credential.

    The real adapter answers with advice or with None, and never raises. Each
    of those is a case a learner can land in, so each is one a test can ask for
    here: `text` advises, `silent` returns None the way a disabled, timed-out
    or malformed call does, and `broken` raises, which the adapter promises
    never to do and which must still not cost the learner their hint.
    """

    def __init__(
        self, *, text: str | None = None, silent: bool = False, broken: bool = False
    ):
        self.enabled = True
        self.text = text
        self.silent = silent
        self.broken = broken
        self.calls: list[tuple[str, dict]] = []

    async def advise(self, *, purpose: str, evidence: dict):
        self.calls.append((purpose, evidence))
        if self.broken:
            raise RuntimeError("the adapter broke its promise")
        if self.silent:
            return None
        return AdvisoryResult(
            text=self.text,
            provider="groq",
            model="test-model",
            generated_at=datetime.now(UTC),
        )


def with_groq(client, adviser: FakeAdviser):
    """Turn the server-side half of the feature gate on for one client.

    The database half is the connection's answer for `GROQ_FLAG`, which each
    test supplies, so the two halves can be varied independently.
    """
    client.app.state.settings.groq_enabled = True
    client.app.state.groq = adviser
    return client


def activity_connection(**overrides):
    results = {
        "app.start_activity_attempt": ATTEMPT_ROW,
        "app.check_activity_answer": CHECK_ROW,
        "app.submit_activity_attempt": SUBMIT_ROW,
        "app.activity_hint": AUTHORED_HINT,
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


def test_the_catalogue_says_whether_an_activity_can_be_started():
    """A published activity is not the same thing as a startable one.

    `status` says the teacher pressed publish. It says nothing about whether
    the activity holds any questions, so a client reading `status` alone
    offered practice that `app.start_activity_attempt` then refused. The
    catalogue answers the question the client actually has.
    """
    connection = FakeConnection(results={TOTAL: 1, ACTIVITY_LIST: [ACTIVITY_ROW]})
    client = build_client(connection)

    response = client.get("/api/v1/activities", headers=LEARNER_HEADERS)

    assert response.status_code == 200
    activity = response.json()["data"][0]
    assert activity["question_count"] == 1
    assert activity["is_ready"] is True


def test_an_activity_with_no_questions_is_not_ready():
    """The state that used to be invisible until a learner opened it."""
    empty = {**ACTIVITY_ROW, "question_count": 0, "is_ready": False}
    connection = FakeConnection(results={TOTAL: 1, ACTIVITY_LIST: [empty]})
    client = build_client(connection)

    response = client.get("/api/v1/activities", headers=LEARNER_HEADERS)

    assert response.status_code == 200
    activity = response.json()["data"][0]
    assert activity["status"] == "published"
    assert activity["question_count"] == 0
    assert activity["is_ready"] is False


def test_the_activity_detail_carries_the_same_readiness_as_the_list():
    """One answer, so a detail page cannot contradict the card that opened it."""
    empty = {**ACTIVITY_ROW, "question_count": 0, "is_ready": False}
    client = build_client(activity_connection(**{ACTIVITY_BY_ID: empty, QUESTIONS: []}))

    response = client.get(f"/api/v1/activities/{ACTIVITY}", headers=LEARNER_HEADERS)

    assert response.status_code == 200
    assert response.json()["data"]["is_ready"] is False


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


def test_an_enabled_groq_adds_wording_beside_the_authored_hint():
    adviser = FakeAdviser(text="Think about what two minus signs do together.")
    client = with_groq(build_client(activity_connection(**{GROQ_FLAG: True})), adviser)

    response = client.post(
        f"/api/v1/activity-attempts/{ATTEMPT}/hints",
        json={"question_id": str(QUESTION)},
        headers=LEARNER_HEADERS,
    )

    assert response.status_code == 200
    data = response.json()["data"]
    # The authored hint is what it always was; the advisory wording is extra.
    assert data["hint"] == AUTHORED_HINT
    assert data["ai_hint"] == "Think about what two minus signs do together."

    # Only the authored hint goes out, and nothing shaped like an answer.
    _purpose, evidence = adviser.calls[0]
    assert evidence["authored_hint"] == AUTHORED_HINT
    assert not any("answer" in key for key in evidence)


@pytest.mark.parametrize(
    "adviser",
    [FakeAdviser(silent=True), FakeAdviser(broken=True)],
    ids=["groq_is_silent", "groq_raises"],
)
def test_a_failed_groq_call_still_returns_the_authored_hint(adviser):
    client = with_groq(build_client(activity_connection(**{GROQ_FLAG: True})), adviser)

    response = client.post(
        f"/api/v1/activity-attempts/{ATTEMPT}/hints",
        json={"question_id": str(QUESTION)},
        headers=LEARNER_HEADERS,
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["hint"] == AUTHORED_HINT
    assert data["ai_hint"] is None


def test_the_database_feature_flag_switches_the_advisory_wording_off():
    adviser = FakeAdviser(text="Advice nobody asked for.")
    # Server configuration says yes; the Teacher/Administrator flag says no.
    client = with_groq(build_client(activity_connection(**{GROQ_FLAG: False})), adviser)

    response = client.post(
        f"/api/v1/activity-attempts/{ATTEMPT}/hints",
        json={"question_id": str(QUESTION)},
        headers=LEARNER_HEADERS,
    )

    assert response.json()["data"]["ai_hint"] is None
    assert adviser.calls == []


def test_a_question_with_no_authored_hint_is_never_given_a_generated_one():
    adviser = FakeAdviser(text="Here is a hint I invented.")
    connection = activity_connection(**{"app.activity_hint": None, GROQ_FLAG: True})
    client = with_groq(build_client(connection), adviser)

    response = client.post(
        f"/api/v1/activity-attempts/{ATTEMPT}/hints",
        json={"question_id": str(QUESTION)},
        headers=LEARNER_HEADERS,
    )

    data = response.json()["data"]
    assert data["hint"] is None
    assert data["ai_hint"] is None
    assert adviser.calls == []


def test_no_activity_response_carries_an_answer_key():
    """Every response a learner can reach, including the advisory one."""
    adviser = FakeAdviser(text="Two negatives make a positive.")
    client = with_groq(build_client(activity_connection(**{GROQ_FLAG: True})), adviser)

    responses = [
        client.get(f"/api/v1/activities/{ACTIVITY}", headers=LEARNER_HEADERS),
        client.post(f"/api/v1/activities/{ACTIVITY}/attempts", headers=LEARNER_HEADERS),
        client.post(
            f"/api/v1/activity-attempts/{ATTEMPT}/answer-checks",
            json={"question_id": str(QUESTION), "answer": "-72"},
            headers=LEARNER_HEADERS,
        ),
        client.post(
            f"/api/v1/activity-attempts/{ATTEMPT}/hints",
            json={"question_id": str(QUESTION)},
            headers=LEARNER_HEADERS,
        ),
        client.post(
            f"/api/v1/activity-attempts/{ATTEMPT}/submit",
            json={"answers": [{"question_id": str(QUESTION), "answer": "72"}]},
            headers=LEARNER_HEADERS,
        ),
    ]

    for response in responses:
        assert response.status_code in (200, 201)
        for forbidden in ("answer_key", "correct_answer", "correct_choice"):
            assert forbidden not in response.text

    # And nothing resembling a key was sent to the adapter either.
    for _purpose, evidence in adviser.calls:
        assert set(evidence) == {"grade", "authored_hint"}


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


# ---------------------------------------------------------------------------
# What the database refuses, and how the learner is told
# ---------------------------------------------------------------------------
class RefusingStart(FakeConnection):
    """Raises one chosen database error from the start function."""

    def __init__(self, error, **kwargs):
        super().__init__(**kwargs)
        self._error = error

    async def fetchrow(self, query, *args):
        if "app.start_activity_attempt" in query:
            raise self._error
        return await super().fetchrow(query, *args)


@pytest.mark.parametrize(
    ("error", "status", "code"),
    [
        (asyncpg.AssertError("no complete published question set"), 409, "activity_not_ready"),
        (asyncpg.NoDataFoundError("no such published activity"), 404, None),
        (asyncpg.InsufficientPrivilegeError("not a learner"), 403, None),
        (
            asyncpg.ObjectNotInPrerequisiteStateError("locked"),
            412,
            "content_locked",
        ),
    ],
)
def test_a_refused_start_is_answered_not_dropped(error, status, code):
    """Every refusal the function can raise reaches the learner as itself.

    Only the locked case was handled before. An activity with no questions,
    one whose module had been unpublished, and an attempt frozen before the
    question snapshot existed all arrived as a bare 500 reading "The request
    could not be completed" — which tells a learner nothing and a teacher
    less.
    """
    client = build_client(RefusingStart(error, results={ACTIVITY_BY_ID: ACTIVITY_ROW}))

    response = client.post(
        f"/api/v1/activities/{ACTIVITY}/attempts", headers=LEARNER_HEADERS
    )

    assert response.status_code == status
    body = response.json()["error"]
    assert body["message"] != "The request could not be completed."
    if code is not None:
        assert body["code"] == code


def test_an_activity_with_no_questions_says_what_is_wrong():
    client = build_client(
        RefusingStart(
            asyncpg.AssertError("The activity has no complete published question set"),
            results={ACTIVITY_BY_ID: ACTIVITY_ROW},
        )
    )

    response = client.post(
        f"/api/v1/activities/{ACTIVITY}/attempts", headers=LEARNER_HEADERS
    )

    assert response.status_code == 409
    # Addressed to a child, and it names who can fix it.
    assert "not ready yet" in response.json()["error"]["message"]
