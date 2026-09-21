"""Reports & Analytics: the filtered overview, and its optional Groq summary.

The overview is deterministic, so these tests hold it to the database's
figures, to one set of filters bound the same way into every statement, and
to the disclosure rule that withholds any average drawn from fewer than five
learners.

The summary is advisory. It is asked for, never automatic; it is built from
aggregates the server reads itself; it comes back short and structured with
no provider, model or time; and every way Groq can fail leaves a 503 behind,
with the report itself untouched.
"""

from datetime import UTC, datetime, timedelta, timezone
from uuid import UUID

from modules.shared.testing import (
    ADVISER_HEADERS,
    LEARNER_HEADERS,
    FakeConnection,
    FakeDatabase,
    FakeSessionGateway,
    FakeVerifier,
    build_client,
    fake_settings,
)

SECTION = UUID("cc7ef387-7435-4af0-8c50-0a7ce6aa5f5c")
COMPETENCY = UUID("13ec5f06-746e-45fb-a58a-92f4ce42621c")
QUESTION = UUID("9a000000-0000-4000-8000-000000000001")

SUMMARY = "as average_growth"
SECTIONS = "join scoped_learners on scoped_learners.section_id"
COMPETENCIES = "as average_band"
ACTIVITY = "as assessments_scored"
MISSED = "app.report_question_misses"
CASES = "as median_days_to_resolve"
WATCH = "count(*) over ()"
GATE = "app.groq_advisory_enabled()"

SUMMARY_ROW = {
    "learner_count": 7,
    "needs_support_count": 1,
    "improving_count": 0,
    "mastered_count": 0,
    "diagnostic_not_started": 0,
    "diagnostic_in_progress": 0,
    "diagnostic_completed": 7,
    "learners_with_scores": 7,
    "average_current": 44.9,
    "average_diagnostic": 46.43,
    "learners_with_growth": 7,
    "average_growth": -1.53,
    "published_competency_count": 4,
}

SECTION_ROW = {
    "section_id": SECTION,
    "section_name": "Sampaguita",
    "learner_count": 7,
    "needs_support_count": 1,
    "mastered_count": 0,
    "diagnostic_completed": 7,
    "learners_with_scores": 7,
    "average_current": 44.9,
    "average_diagnostic": 46.43,
}

SMALL_SECTION_ROW = {
    **SECTION_ROW,
    "section_id": UUID("dd000000-0000-4000-8000-000000000001"),
    "section_name": "Rosal",
    "learner_count": 2,
    "learners_with_scores": 2,
    "average_current": 12.0,
}

COMPETENCY_ROW = {
    "competency_id": COMPETENCY,
    "code": "M6NS-03",
    "name": "Expressing ratios in simplest form",
    "learners_tracked": 7,
    "mastered_count": 2,
    "developing_count": 0,
    "needs_improvement_count": 5,
    "average_current": 28.57,
    "average_diagnostic": 28.57,
    "average_band": "Needs Improvement",
}

ACTIVITY_ROW = {
    "assessments_scored": 8,
    "assessment_learners": 7,
    "assessment_average": 40.5,
    "activity_attempts": 12,
    "activity_learners": 2,
    "activity_passed": 5,
    "activity_average": 61.0,
    "modules_completed": 1,
}

MISSED_ROW = {
    "question_id": QUESTION,
    "competency_id": COMPETENCY,
    "competency_code": "M6NS-03",
    "competency_name": "Expressing ratios in simplest form",
    "prompt": "Which ratio is equivalent to 3 : 4?",
    "choices": '[{"key": "a", "label": "6 : 8"}, {"key": "d", "label": "4 : 3"}]',
    "learners_answered": 7,
    "answered": 7,
    "incorrect": 5,
    "common_wrong_answer": '"d"',
    "common_wrong_times": 5,
}

CASES_ROW = {
    "needs_intervention": 2,
    "in_progress": 2,
    "resolved": 1,
    "opened_in_range": 3,
    "resolved_in_range": 1,
    "median_days_to_resolve": 2.5,
}

WATCH_ROW = {
    "student_id": UUID("58000000-0000-4000-8000-000000000001"),
    "learner_id": "DEMO-LRN-0001",
    "full_name": "Ana Dela Cruz",
    "section_name": "Sampaguita",
    "monitoring_status": "needs_intervention",
    "diagnostic_average": 25.0,
    "current_average": 14.29,
    "open_intervention_count": 3,
    "total": 2,
}


def report_connection(**overrides):
    results = {
        GATE: True,
        SUMMARY: SUMMARY_ROW,
        SECTIONS: [SECTION_ROW, SMALL_SECTION_ROW],
        COMPETENCIES: [COMPETENCY_ROW],
        ACTIVITY: ACTIVITY_ROW,
        MISSED: [MISSED_ROW],
        CASES: CASES_ROW,
        WATCH: [WATCH_ROW],
    }
    results.update(overrides)
    return FakeConnection(results=results)


def overview(client, **params):
    return client.get(
        "/api/v1/teacher-admin/reports/overview", params=params, headers=ADVISER_HEADERS
    )


# ---------------------------------------------------------------------------
# The overview
# ---------------------------------------------------------------------------


def test_the_overview_reports_every_block_from_the_database():
    response = overview(build_client(report_connection()))

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["summary"]["learner_count"] == 7
    assert data["summary"]["diagnostic"] == {"not_started": 0, "in_progress": 0, "completed": 7}
    assert data["summary"]["average_current"] == 44.9
    assert data["summary"]["average_growth"] == -1.53
    assert data["competencies"][0]["needs_improvement_count"] == 5
    assert data["competencies"][0]["growth"] == 0.0
    assert data["activity"]["assessments_scored"] == 8
    assert data["interventions"]["median_days_to_resolve"] == 2.5
    assert data["watch_list"]["total"] == 2
    assert data["watch_list"]["rows"][0]["open_intervention_count"] == 3


def test_an_average_drawn_from_fewer_than_five_learners_is_withheld():
    connection = report_connection(
        **{SUMMARY: {**SUMMARY_ROW, "learners_with_scores": 3, "learners_with_growth": 3}}
    )
    data = overview(build_client(connection)).json()["data"]

    assert data["summary"]["average_current"] is None
    assert data["summary"]["average_growth"] is None
    assert data["summary"]["averages_suppressed"] is True
    # The counts stay: knowing there are seven learners discloses nothing.
    assert data["summary"]["learner_count"] == 7

    small = next(row for row in data["sections"] if row["name"] == "Rosal")
    assert small["average_current"] is None and small["suppressed"] is True
    assert small["learner_count"] == 2

    # Practice by two learners is not averaged either.
    assert data["activity"]["activity_average"] is None
    assert data["activity"]["activity_attempts"] == 12


def test_a_wrong_answer_is_named_by_its_wording_and_only_when_shared():
    data = overview(build_client(report_connection())).json()["data"]
    assert data["most_missed"][0]["common_wrong_answer"] == "4 : 3"
    assert data["most_missed"][0]["common_wrong_count"] == 5

    lone = report_connection(**{MISSED: [{**MISSED_ROW, "common_wrong_times": 1}]})
    data = overview(build_client(lone)).json()["data"]
    assert data["most_missed"][0]["common_wrong_answer"] is None


def test_every_statement_binds_the_same_filters_and_a_whole_school_day():
    connection = report_connection()
    response = overview(
        build_client(connection),
        section_id=str(SECTION),
        competency_id=str(COMPETENCY),
        status="needs_intervention",
        **{"from": "2026-09-01", "to": "2026-09-30"},
    )
    assert response.status_code == 200

    manila = timezone(timedelta(hours=8))
    start = datetime(2026, 9, 1, tzinfo=manila)
    until = datetime(2026, 10, 1, tzinfo=manila)
    report_calls = [args for query, args in connection.calls if "scoped_learners as" in query]
    assert len(report_calls) == 7
    for args in report_calls:
        assert SECTION in args
        assert "needs_intervention" in args
    assert any(start in args for _, args in connection.calls)
    assert any(until in args for _, args in connection.calls)
    assert start.astimezone(UTC).hour == 16  # midnight in Manila, not in UTC


def test_the_most_missed_questions_need_five_learners():
    connection = report_connection()
    overview(build_client(connection))

    (args,) = [args for query, args in connection.calls if MISSED in query]
    assert 5 in args


def test_a_range_that_ends_before_it_starts_is_refused():
    response = overview(
        build_client(report_connection()), **{"from": "2026-09-30", "to": "2026-09-01"}
    )
    assert response.status_code == 422


def test_an_unknown_status_is_refused():
    response = overview(build_client(report_connection()), status="expelled")
    assert response.status_code == 422


def test_a_learner_cannot_read_the_report():
    client = build_client(report_connection())
    response = client.get("/api/v1/teacher-admin/reports/overview", headers=LEARNER_HEADERS)
    assert response.status_code == 403

    response = client.post(
        "/api/v1/teacher-admin/reports/summary", json={}, headers=LEARNER_HEADERS
    )
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# The optional Groq summary
# ---------------------------------------------------------------------------


class FakeGroq:
    def __init__(self, *, text=None, enabled=True):
        self.text = text
        self._enabled = enabled
        self.calls = []

    @property
    def enabled(self):
        return self._enabled

    async def advise(self, *, purpose, evidence, **shape):
        from modules.shared.groq_adapter import AdvisoryResult

        self.calls.append({"purpose": purpose, "evidence": evidence, **shape})
        if self.text is None:
            return None
        return AdvisoryResult(
            text=self.text,
            provider="groq",
            model="a-configured-model",
            generated_at=datetime.now(UTC),
            confidence=None,
        )


def summary_client(groq, *, connection=None, server_enabled=True):
    from fastapi.testclient import TestClient
    from pydantic import SecretStr

    from app.main import create_app

    settings = fake_settings()
    settings.groq_enabled = server_enabled
    if server_enabled:
        settings.groq_model = "a-configured-model"
        settings.groq_api_key = SecretStr("gsk_test")
    application = create_app(
        settings=settings,
        token_verifier=FakeVerifier(),
        database=FakeDatabase(connection or report_connection()),
        session_gateway=FakeSessionGateway(),
        groq=groq,
    )
    return TestClient(application, raise_server_exceptions=False)


def summarise(client, body=None):
    return client.post(
        "/api/v1/teacher-admin/reports/summary", json=body or {}, headers=ADVISER_HEADERS
    )


STRUCTURED = (
    '{"overview": "Seven learners sat the diagnostic and most are still developing ratios.",'
    ' "patterns": ["5 of 7 answers chose 4 : 3, reversing the order of the ratio.",'
    ' "9 of 10 learners guessed at random."],'
    ' "actions": ["Model ratio order with labelled pairs.", "Use a quick exit ticket."]}'
)


def test_a_summary_comes_back_structured_and_without_provenance():
    groq = FakeGroq(text=STRUCTURED)
    response = summarise(summary_client(groq))

    assert response.status_code == 200
    data = response.json()["data"]
    assert set(data) == {"overview", "patterns", "actions"}
    assert data["overview"].startswith("Seven learners")
    # The invented "9 of 10" pattern is dropped; the recorded one stays.
    assert data["patterns"] == ["5 of 7 answers chose 4 : 3, reversing the order of the ratio."]
    assert len(data["actions"]) == 2
    body = response.text.lower()
    for leaked in ("groq", "a-configured-model", "generated_at", "provider", "confidence"):
        assert leaked not in body


def test_the_summary_evidence_is_aggregate_and_names_no_learner():
    groq = FakeGroq(text=STRUCTURED)
    summarise(summary_client(groq))

    (call,) = groq.calls
    evidence = str(call["evidence"])
    assert "Ana Dela Cruz" not in evidence
    assert "DEMO-LRN-0001" not in evidence
    assert "Which ratio is equivalent" in evidence
    assert call["evidence"]["learners"] == 7
    assert call["max_tokens"] and "JSON" in call["instructions"]


def test_the_request_cannot_supply_its_own_figures():
    response = summarise(summary_client(FakeGroq(text=STRUCTURED)), {"average_current": 99})
    assert response.status_code == 422


def test_prose_is_accepted_and_markdown_is_removed():
    groq = FakeGroq(text="## Summary\n**Most learners** are developing. Try [this](http://x.y).")
    data = summarise(summary_client(groq)).json()["data"]
    assert "**" not in data["overview"] and "#" not in data["overview"]
    assert "http" not in str(data)


def test_a_long_reply_is_held_to_one_hundred_and_fifty_words():
    long = " ".join(["Learners are still developing ratio understanding."] * 60)
    data = summarise(summary_client(FakeGroq(text=long))).json()["data"]
    parts = [data["overview"], *data["patterns"], *data["actions"]]
    total = sum(len(part.split()) for part in parts)
    assert total <= 150


def test_every_groq_failure_is_the_same_503():
    cases = [
        summary_client(FakeGroq(text=None)),  # timeout, rate limit or malformed body
        summary_client(FakeGroq(text="   ")),  # nothing readable
        summary_client(FakeGroq(text=STRUCTURED, enabled=False), server_enabled=False),
        summary_client(
            FakeGroq(text=STRUCTURED), connection=report_connection(**{GATE: False})
        ),  # the classroom setting is off
    ]
    for client in cases:
        response = summarise(client)
        assert response.status_code == 503
        assert response.json()["error"]["code"] == "groq_assistance_unavailable"


def test_the_classroom_setting_off_means_groq_is_never_asked():
    groq = FakeGroq(text=STRUCTURED)
    summarise(summary_client(groq, connection=report_connection(**{GATE: False})))
    assert groq.calls == []


def test_the_report_itself_does_not_depend_on_groq():
    client = summary_client(FakeGroq(text=None), connection=report_connection(**{GATE: False}))
    assert overview(client).status_code == 200
