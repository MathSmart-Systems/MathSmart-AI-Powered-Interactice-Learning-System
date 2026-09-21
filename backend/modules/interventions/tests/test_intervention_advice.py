"""Advisory support attached to one intervention case.

The rules being checked here are the boundary ones. A suggestion is only ever
produced when a teacher asks for it; the evidence that leaves the process is
assembled from the case's own record and carries no learner identity; the text
is written by the server and never accepted from a request; and every way Groq
can fail — switched off at the server, switched off in the database, silent,
slow, or answering in a shape we did not expect — leaves the case untouched and
the deterministic workflow usable.

The database side of that promise, that storing advice changes no
deterministic field, is proved against PostgreSQL in
`supabase/tests/560_intervention_advice_test.sql`.
"""

from modules.interventions.tests.test_interventions import (
    BY_ID,
    ROW,
    WRITTEN_ROW,
    intervention_connection,
)
from modules.shared.testing import ADVISER_HEADERS, LEARNER_HEADERS

ADVICE = "/api/v1/interventions/f87d7703-ef37-4bfa-943f-c2bc7e69cb01/ai-suggestion"
ATTACH = "app.attach_intervention_advice"
CLEAR = "app.clear_intervention_advice"

GAP = "Ana divides the digits separately and loses the decimal point."
STRATEGY_ONE = "Work three problems on a number line before any written method."
STRATEGY_TWO = "Ask her to estimate the answer first, then compare."
SCAFFOLD = "Use a place-value chart with the decimal point drawn in red."
NEXT_CHECK = "Give two similar problems on Friday and watch where the point lands."

PLAN = (
    '{"gap": "' + GAP + '", '
    '"strategies": ["' + STRATEGY_ONE + '", "' + STRATEGY_TWO + '"], '
    '"scaffold": "' + SCAFFOLD + '", '
    '"next_check": "' + NEXT_CHECK + '"}'
)

#: What the route asks for, and therefore the key every fake answers under.
PURPOSE = "intervention support plan"


class SelectiveGroq:
    """Answers some purposes and refuses others, so a partial reply is testable."""

    def __init__(self, *, answers: dict | None = None, enabled: bool = True):
        self.answers = answers if answers is not None else {PURPOSE: PLAN}
        self._enabled = enabled
        self.calls: list[dict] = []

    @property
    def enabled(self) -> bool:
        return self._enabled

    async def advise(self, *, purpose: str, evidence: dict, **shape):
        from datetime import UTC, datetime

        from modules.shared.groq_adapter import AdvisoryResult

        self.calls.append({"purpose": purpose, "evidence": evidence, **shape})
        text = self.answers.get(purpose, PLAN)
        if text is None:
            return None
        return AdvisoryResult(
            text=text,
            provider="groq",
            model="a-configured-model",
            generated_at=datetime.now(UTC),
            confidence=None,
        )


def advisory_client(
    connection,
    groq: SelectiveGroq | None = None,
    *,
    live_session: bool = True,
    server_groq_enabled: bool = True,
    advisory_flag: bool = True,
):
    """The real application, with Groq and the advisory flag under the test's control."""
    from fastapi.testclient import TestClient
    from pydantic import SecretStr

    from app.main import create_app
    from modules.shared.testing import (
        FakeDatabase,
        FakeSessionGateway,
        FakeVerifier,
        fake_settings,
    )

    settings = fake_settings()
    settings.groq_enabled = server_groq_enabled
    if server_groq_enabled:
        settings.groq_model = "a-configured-model"
        settings.groq_api_key = SecretStr("gsk_test")

    connection.results.setdefault("from app.system_settings", advisory_flag)

    application = create_app(
        settings=settings,
        token_verifier=FakeVerifier(),
        database=FakeDatabase(connection),
        session_gateway=FakeSessionGateway(live=live_session),
        groq=groq if groq is not None else SelectiveGroq(enabled=server_groq_enabled),
    )
    return TestClient(application, raise_server_exceptions=False)


def advisory_connection(**overrides):
    prepared = {ATTACH: WRITTEN_ROW, CLEAR: WRITTEN_ROW}
    prepared.update(overrides)
    return intervention_connection(**prepared)


def attach_calls(connection):
    return [call for call in connection.calls if ATTACH in call[0]]


def clear_calls(connection):
    return [call for call in connection.calls if CLEAR in call[0]]


def plan_written(connection):
    """The JSON plan handed to the database, already parsed."""
    import json as _json

    return _json.loads(attach_calls(connection)[0][1][6])


def test_a_teacher_admin_asks_for_a_suggestion_and_it_is_kept():
    connection = advisory_connection()
    groq = SelectiveGroq()
    client = advisory_client(connection, groq)

    response = client.post(ADVICE, headers=ADVISER_HEADERS)

    assert response.status_code == 200
    written = attach_calls(connection)
    assert len(written) == 1
    args = written[0][1]

    # The gap doubles as the plain-text summary the older contract returns.
    assert args[1] == GAP
    # One plan, not a teaching note and a remediation idea saying the same
    # thing twice: the second text column is deliberately left empty.
    assert args[2] is None
    assert args[3] == "groq"

    plan = plan_written(connection)
    assert plan["gap"] == GAP
    assert plan["strategies"] == [STRATEGY_ONE, STRATEGY_TWO]
    assert plan["scaffold"] == SCAFFOLD
    assert plan["next_check"] == NEXT_CHECK


def test_the_request_asks_for_the_shape_it_can_render():
    connection = advisory_connection()
    groq = SelectiveGroq()
    client = advisory_client(connection, groq)

    client.post(ADVICE, headers=ADVISER_HEADERS)

    call = groq.calls[0]
    assert call["purpose"] == PURPOSE
    # A prompt is a request rather than a guarantee, but asking is still the
    # first half of getting a short answer instead of an essay.
    assert "JSON object" in call["instructions"]
    assert "at most 3" in call["instructions"]
    assert call["max_tokens"] > 0


def test_a_suggestion_never_carries_the_learners_identity():
    connection = advisory_connection()
    groq = SelectiveGroq()
    client = advisory_client(connection, groq)

    client.post(ADVICE, headers=ADVISER_HEADERS)

    assert groq.calls
    sent = repr(groq.calls)
    # The evidence is assembled from the case's own deterministic record. Who
    # the learner is has no bearing on what would help them, so it is not sent.
    assert ROW["full_name"] not in sent
    assert ROW["learner_id"] not in sent


def test_reading_a_case_never_generates_a_suggestion():
    connection = advisory_connection()
    groq = SelectiveGroq()
    client = advisory_client(connection, groq)

    client.get("/api/v1/interventions", headers=ADVISER_HEADERS)
    client.get(
        "/api/v1/interventions/f87d7703-ef37-4bfa-943f-c2bc7e69cb01",
        headers=ADVISER_HEADERS,
    )

    assert groq.calls == []


def test_a_reply_wrapped_in_a_code_fence_is_still_a_plan():
    connection = advisory_connection()
    fenced = "Here you go:\n```json\n" + PLAN + "\n```"
    client = advisory_client(connection, SelectiveGroq(answers={PURPOSE: fenced}))

    response = client.post(ADVICE, headers=ADVISER_HEADERS)

    assert response.status_code == 200
    assert plan_written(connection)["gap"] == GAP


def test_json_followed_by_a_friendly_sentence_is_still_a_plan():
    connection = advisory_connection()
    chatty = f"{PLAN}\n\nLet me know if you would like more detail!"
    client = advisory_client(connection, SelectiveGroq(answers={PURPOSE: chatty}))

    response = client.post(ADVICE, headers=ADVISER_HEADERS)

    assert response.status_code == 200
    plan = plan_written(connection)
    # Trusting the last brace in the reply put the model's own JSON into the
    # summary a teacher reads. The object is found by balance instead.
    assert plan["gap"] == GAP
    assert "{" not in plan["gap"]


def test_markdown_never_reaches_the_teacher():
    connection = advisory_connection()
    messy = (
        '{"gap": "**Key gap:** she drops the point.", '
        '"strategies": ["### Step one\\n- use a number line", "| a | b |"], '
        '"scaffold": "`place value chart`", "next_check": "Ask again."}'
    )
    client = advisory_client(connection, SelectiveGroq(answers={PURPOSE: messy}))

    response = client.post(ADVICE, headers=ADVISER_HEADERS)

    assert response.status_code == 200
    plan = plan_written(connection)
    rendered = " ".join([plan["gap"], *plan["strategies"], plan["scaffold"] or ""])
    for marker in ("**", "###", "`", "|", "- "):
        assert marker not in rendered


def test_an_essay_is_cut_down_rather_than_stored_whole():
    connection = advisory_connection()
    essay = " ".join(f"Sentence number {index} about decimals." for index in range(60))
    client = advisory_client(connection, SelectiveGroq(answers={PURPOSE: essay}))

    response = client.post(ADVICE, headers=ADVISER_HEADERS)

    assert response.status_code == 200
    plan = plan_written(connection)
    assert len(plan["gap"]) <= 240
    assert len(plan["strategies"]) <= 3
    for strategy in plan["strategies"]:
        assert len(strategy) <= 220

    # The whole thing has to stay readable at a glance, not merely be shorter
    # than it was.
    total = len(plan["gap"]) + sum(len(item) for item in plan["strategies"])
    assert total <= 1000


def test_prose_that_is_not_json_still_becomes_a_usable_plan():
    connection = advisory_connection()
    prose = (
        "Ana loses the decimal point when she divides. "
        "Try a number line first. "
        "Then ask her to estimate before writing anything down."
    )
    client = advisory_client(connection, SelectiveGroq(answers={PURPOSE: prose}))

    response = client.post(ADVICE, headers=ADVISER_HEADERS)

    assert response.status_code == 200
    plan = plan_written(connection)
    assert plan["gap"].startswith("Ana loses the decimal point")
    assert len(plan["strategies"]) == 2


def test_groq_being_off_at_the_server_leaves_the_case_as_it_was():
    connection = advisory_connection()
    client = advisory_client(connection, server_groq_enabled=False)

    response = client.post(ADVICE, headers=ADVISER_HEADERS)

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "groq_assistance_unavailable"
    assert attach_calls(connection) == []


def test_the_advisory_flag_being_off_refuses_without_writing():
    connection = advisory_connection()
    client = advisory_client(connection, advisory_flag=False)

    response = client.post(ADVICE, headers=ADVISER_HEADERS)

    assert response.status_code == 503
    assert attach_calls(connection) == []


def test_a_silent_reply_writes_nothing():
    connection = advisory_connection()
    client = advisory_client(connection, SelectiveGroq(answers={PURPOSE: None}))

    response = client.post(ADVICE, headers=ADVISER_HEADERS)

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "groq_assistance_unavailable"
    assert attach_calls(connection) == []


def test_a_reply_with_no_words_in_it_writes_nothing():
    connection = advisory_connection()
    client = advisory_client(connection, SelectiveGroq(answers={PURPOSE: "**  ##  **"}))

    response = client.post(ADVICE, headers=ADVISER_HEADERS)

    assert response.status_code == 503
    assert attach_calls(connection) == []


def test_a_learner_cannot_ask_for_a_suggestion():
    connection = advisory_connection()
    groq = SelectiveGroq()
    client = advisory_client(connection, groq)

    response = client.post(ADVICE, headers=LEARNER_HEADERS)

    assert response.status_code == 403
    assert groq.calls == []
    assert attach_calls(connection) == []


def test_asking_for_a_suggestion_needs_a_live_session():
    connection = advisory_connection()
    client = advisory_client(connection, live_session=False)

    response = client.post(ADVICE, headers=ADVISER_HEADERS)

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "session_revoked"
    assert attach_calls(connection) == []


def test_a_suggestion_on_an_unknown_case_is_not_found():
    connection = advisory_connection(**{BY_ID: None})
    client = advisory_client(connection)

    response = client.post(ADVICE, headers=ADVISER_HEADERS)

    assert response.status_code == 404


def test_a_teacher_admin_dismisses_a_suggestion():
    connection = advisory_connection()
    client = advisory_client(connection)

    response = client.request("DELETE", ADVICE, headers=ADVISER_HEADERS)

    assert response.status_code == 200
    assert len(clear_calls(connection)) == 1


def test_a_learner_cannot_dismiss_a_suggestion():
    connection = advisory_connection()
    client = advisory_client(connection)

    response = client.request("DELETE", ADVICE, headers=LEARNER_HEADERS)

    assert response.status_code == 403
    assert clear_calls(connection) == []


def test_dismissing_needs_a_live_session():
    connection = advisory_connection()
    client = advisory_client(connection, live_session=False)

    response = client.request("DELETE", ADVICE, headers=ADVISER_HEADERS)

    assert response.status_code == 401
    assert clear_calls(connection) == []


def test_dismissing_an_unknown_case_is_not_found():
    connection = advisory_connection(**{CLEAR: None})
    client = advisory_client(connection)

    response = client.request("DELETE", ADVICE, headers=ADVISER_HEADERS)

    assert response.status_code == 404
