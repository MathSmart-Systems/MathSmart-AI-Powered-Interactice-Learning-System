"""Groq assistance routes.

Everything here is advisory. These endpoints exist so a workflow can ask for
phrasing it may then choose to show; nothing they return decides correctness, a
score, a band, an unlock, an intervention, a role or a permission — the routes
that decide those never call them.

The rules worth testing are therefore: the credential and the model never appear
in a request or a response, an unavailable Groq is a clean 503 rather than a
failure of the learning endpoints, and identifying evidence never leaves the
process.
"""

from uuid import UUID

import pytest

from modules.shared.groq_adapter import AdvisoryResult
from modules.shared.testing import (
    ADVISER_HEADERS,
    LEARNER_HEADERS,
    FakeConnection,
    FakeDatabase,
    FakeSessionGateway,
    FakeVerifier,
    fake_settings,
)

COMPETENCY = UUID("13ec5f06-746e-45fb-a58a-92f4ce42621c")
STUDENT_ID = UUID("58000000-0000-4000-8000-000000000001")


class FakeGroq:
    """Answers, or refuses, exactly as the test says."""

    def __init__(self, *, text: str | None = "Advisory text.", enabled: bool = True):
        self.text = text
        self._enabled = enabled
        self.calls: list[dict] = []

    @property
    def enabled(self) -> bool:
        return self._enabled

    async def advise(self, *, purpose: str, evidence: dict):
        from datetime import UTC, datetime

        self.calls.append({"purpose": purpose, "evidence": evidence})
        if self.text is None:
            return None
        return AdvisoryResult(
            text=self.text,
            provider="groq",
            model="a-configured-model",
            generated_at=datetime.now(UTC),
            confidence=0.62,
        )


def ai_client(groq: FakeGroq | None = None, *, live_session: bool = True):
    from fastapi.testclient import TestClient

    from app.main import create_app

    application = create_app(
        settings=fake_settings(),
        token_verifier=FakeVerifier(),
        database=FakeDatabase(FakeConnection()),
        session_gateway=FakeSessionGateway(live=live_session),
        groq=groq or FakeGroq(),
    )
    return TestClient(application, raise_server_exceptions=False)


PATTERN_BODY = {
    "grade": "Grade 6",
    "competency_id": str(COMPETENCY),
    "incorrect_attempts": [
        {
            "question_text": "What is (-9) x (-8)?",
            "submitted_answer": "-72",
            "correct_answer": "72",
        }
    ],
}


def test_pattern_analysis_returns_advice_with_its_provenance():
    client = ai_client()

    response = client.post(
        "/api/v1/ai/pattern-analysis", json=PATTERN_BODY, headers=ADVISER_HEADERS
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["misconception_summary"] == "Advisory text."
    assert data["provider"] == "groq"
    assert data["model"] == "a-configured-model"
    assert data["generated_at"]


def test_an_unavailable_groq_is_a_clean_503():
    """The learning endpoints still work; a direct AI request says so plainly."""
    client = ai_client(FakeGroq(text=None))

    response = client.post(
        "/api/v1/ai/pattern-analysis", json=PATTERN_BODY, headers=ADVISER_HEADERS
    )

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "groq_assistance_unavailable"


def test_a_disabled_groq_is_the_same_503():
    client = ai_client(FakeGroq(text=None, enabled=False))

    response = client.post(
        "/api/v1/ai/pattern-analysis", json=PATTERN_BODY, headers=ADVISER_HEADERS
    )

    assert response.status_code == 503


def test_a_request_cannot_choose_the_model():
    """The model is deployment configuration read from the environment."""
    client = ai_client()

    response = client.post(
        "/api/v1/ai/pattern-analysis",
        json={**PATTERN_BODY, "model": "a-model-i-picked"},
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 422
    assert "model" in response.json()["error"]["fields"]


def test_a_request_cannot_supply_a_credential():
    client = ai_client()

    response = client.post(
        "/api/v1/ai/pattern-analysis",
        json={**PATTERN_BODY, "api_key": "sb_secret_value"},
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 422


def test_identifying_evidence_never_reaches_the_prompt():
    """Redaction is by key, so a learner's name cannot be passed through."""
    groq = FakeGroq()
    client = ai_client(groq)

    client.post(
        "/api/v1/ai/pattern-analysis",
        json={**PATTERN_BODY, "display_context": "Learner in Rizal"},
        headers=ADVISER_HEADERS,
    )

    sent = str(groq.calls[0]["evidence"])
    assert "full_name" not in sent
    assert "email" not in sent


def test_student_feedback_is_available_to_a_learner():
    client = ai_client()

    response = client.post(
        "/api/v1/ai/student-feedback",
        json={"score": 60, "competency_id": str(COMPETENCY)},
        headers=LEARNER_HEADERS,
    )

    assert response.status_code == 200
    assert response.json()["data"]["feedback_text"] == "Advisory text."


def test_teacher_insight_is_not_available_to_a_learner():
    client = ai_client()

    response = client.post(
        "/api/v1/ai/teacher-insight",
        json={"competency_id": str(COMPETENCY), "current_score": 40},
        headers=LEARNER_HEADERS,
    )

    assert response.status_code == 403


def test_an_incorrect_answer_explanation_cannot_change_a_verdict():
    """The response carries no is_correct and no score: it is words, not a grade."""
    client = ai_client()

    response = client.post(
        "/api/v1/ai/incorrect-answer-explanation",
        json={
            "question_text": "What is (-9) x (-8)?",
            "submitted_answer": "-72",
            "is_correct": False,
        },
        headers=LEARNER_HEADERS,
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert "is_correct" not in data
    assert "score" not in data


def test_remediation_support_answers_an_educator():
    client = ai_client()

    response = client.post(
        "/api/v1/ai/remediation-support",
        json={"competency_id": str(COMPETENCY), "current_score": 35},
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 200
    assert response.json()["data"]["recommended_module_title"]


@pytest.mark.parametrize(
    "path",
    [
        "/api/v1/ai/pattern-analysis",
        "/api/v1/ai/student-feedback",
        "/api/v1/ai/incorrect-answer-explanation",
        "/api/v1/ai/teacher-insight",
        "/api/v1/ai/remediation-support",
    ],
)
def test_every_ai_route_needs_a_token(path):
    client = ai_client()

    assert client.post(path, json={}).status_code == 401


def test_no_ai_response_carries_a_credential():
    client = ai_client()

    response = client.post(
        "/api/v1/ai/pattern-analysis", json=PATTERN_BODY, headers=ADVISER_HEADERS
    )

    body = response.text.lower()
    for forbidden in ("api_key", "apikey", "authorization", "bearer", "sb_secret"):
        assert forbidden not in body
