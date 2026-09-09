"""Teacher/Administrator dashboard, analytics and the CSV export.

Two things carry real risk here. The first is disclosure: a cohort small enough
to identify one learner must not be reported as an average, and the export must
carry the least data that answers the question. The second is the export file
itself — a cell beginning with `=`, `+`, `-` or `@` is executed as a formula by
spreadsheet software, so every cell is neutralised before it is written.

The export is a sensitive operation: it needs a live session and it is audited.
"""

import csv
import io
import re
from uuid import UUID

from modules.shared.testing import (
    ADVISER_HEADERS,
    LEARNER_HEADERS,
    FakeConnection,
    build_client,
)

SECTION = UUID("cc7ef387-7435-4af0-8c50-0a7ce6aa5f5c")
GRADE = UUID("3f0f0000-0000-4000-8000-000000000006")
COMPETENCY = UUID("13ec5f06-746e-45fb-a58a-92f4ce42621c")
STUDENT_ID = UUID("58000000-0000-4000-8000-000000000001")

# Anchors that appear in exactly one statement each.
DASHBOARD = "scoped_learners"
SECTIONS = "from app.section_performance_summary"
LEARNERS = "from app.student_performance_summary"
COMPETENCIES = "as learners_tracked"
HEATMAP = "from app.competency_progress"
AUDIT = "app.record_audit_event"

DASHBOARD_ROW = {
    "learner_count": 40,
    "active_count": 22,
    "needs_support_count": 9,
    "improving_count": 6,
    "mastered_count": 3,
    "average_mastery": 63,
    "open_intervention_count": 4,
    "published_competency_count": 12,
    "scored_attempt_count": 38,
    "completed_module_count": 51,
}

SECTION_ROW = {
    "section_id": SECTION,
    "grade_id": GRADE,
    "section_name": "Rizal",
    "adviser_id": UUID("4c000000-0000-4000-8000-000000000001"),
    "adviser_name": "Maria Santos",
    "is_active": True,
    "learner_count": 20,
    "active_count": 11,
    "needs_intervention_count": 5,
    "improving_count": 3,
    "mastered_count": 1,
    "inactive_count": 0,
    "average_current_score": 61,
}

LEARNER_ROW = {
    "student_id": STUDENT_ID,
    "learner_id": "STU-2026-001",
    "full_name": "=cmd|'/c calc'!A1",
    "grade_id": GRADE,
    "section_id": SECTION,
    "section_name": "Rizal",
    "monitoring_status": "needs_intervention",
    "diagnostic_status": "completed",
    "diagnostic_average": 48,
    "current_average": 63,
    "competencies_mastered": 1,
    "modules_completed": 1,
    "modules_started": 3,
    "scored_attempt_count": 2,
    "worst_unsuccessful_attempts": 2,
    "open_intervention_count": 1,
    "last_studied_at": None,
}

COMPETENCY_ROW = {
    "competency_id": COMPETENCY,
    "code": "MATH6-INT-02",
    "name": "Multiplication and Division of Integers",
    "domain": "Number Sense",
    "grade_id": GRADE,
    "status": "published",
    "learners_tracked": 20,
    "mastered_count": 4,
    "developing_count": 10,
    "needs_improvement_count": 6,
    "average_current_score": 58,
    "average_diagnostic_score": 41,
}

HEATMAP_ROW = {
    "student_id": STUDENT_ID,
    "learner_id": "STU-2026-001",
    "full_name": "Juan Dela Cruz",
    "competency_id": COMPETENCY,
    "competency_code": "MATH6-INT-02",
    "current_score": 78,
    "mastery_band": "Developing",
}


def reporting_connection(**overrides):
    results = {
        DASHBOARD: DASHBOARD_ROW,
        SECTIONS: [SECTION_ROW],
        LEARNERS: [LEARNER_ROW],
        COMPETENCIES: [COMPETENCY_ROW],
        HEATMAP: [HEATMAP_ROW],
        AUDIT: UUID("7c1f0000-0000-4000-8000-00000000000a"),
    }
    results.update(overrides)
    return FakeConnection(results=results)


# ---------------------------------------------------------------------------
# Dashboard and classes
# ---------------------------------------------------------------------------


def test_the_dashboard_reports_the_cohort():
    client = build_client(reporting_connection())

    response = client.get("/api/v1/teacher-admin/dashboard", headers=ADVISER_HEADERS)

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["totals"]["learner_count"] == 40
    assert data["totals"]["needs_support_count"] == 9
    assert data["totals"]["average_mastery"] == 63
    assert data["competencies"][0]["code"] == "MATH6-INT-02"


def test_a_learner_cannot_read_the_dashboard():
    client = build_client(reporting_connection())

    response = client.get("/api/v1/teacher-admin/dashboard", headers=LEARNER_HEADERS)

    assert response.status_code == 403


def test_classes_report_their_adviser():
    client = build_client(reporting_connection())

    response = client.get("/api/v1/teacher-admin/classes", headers=ADVISER_HEADERS)

    assert response.status_code == 200
    section = response.json()["data"][0]
    assert section["name"] == "Rizal"
    assert section["adviser"]["full_name"] == "Maria Santos"
    assert section["learner_count"] == 20


def test_a_class_roster_carries_the_documented_columns():
    client = build_client(reporting_connection())

    response = client.get(
        f"/api/v1/teacher-admin/classes/{SECTION}/students", headers=ADVISER_HEADERS
    )

    assert response.status_code == 200
    learner = response.json()["data"][0]
    assert learner["learner_id"] == "STU-2026-001"
    assert learner["diagnostic_status"] == "completed"
    assert learner["monitoring_status"] == "needs_intervention"
    assert learner["active_intervention_count"] == 1


def test_a_heatmap_reports_a_band_beside_every_score():
    """The UI must not communicate state through colour alone."""
    client = build_client(reporting_connection())

    response = client.get(
        f"/api/v1/teacher-admin/classes/{SECTION}/heatmap", headers=ADVISER_HEADERS
    )

    assert response.status_code == 200
    cell = response.json()["data"]["rows"][0]["cells"][0]
    assert cell["score"] == 78
    assert cell["mastery_band"] == "Developing"


def test_at_risk_learners_are_listed():
    client = build_client(reporting_connection())

    response = client.get("/api/v1/teacher-admin/students/at-risk", headers=ADVISER_HEADERS)

    assert response.status_code == 200
    assert response.json()["data"][0]["student_id"] == str(STUDENT_ID)


# ---------------------------------------------------------------------------
# Analytics and disclosure
# ---------------------------------------------------------------------------


def test_analytics_reports_cohort_growth():
    client = build_client(reporting_connection())

    response = client.get("/api/v1/teacher-admin/analytics", headers=ADVISER_HEADERS)

    assert response.status_code == 200
    competency = response.json()["data"]["competencies"][0]
    assert competency["average_current_score"] == 58
    assert competency["growth"] == 17


def test_a_cohort_too_small_to_report_is_suppressed():
    """Fewer learners than the threshold and an average identifies one of them."""
    small = {**COMPETENCY_ROW, "learners_tracked": 2}
    client = build_client(reporting_connection(**{COMPETENCIES: [small]}))

    response = client.get("/api/v1/teacher-admin/analytics", headers=ADVISER_HEADERS)

    competency = response.json()["data"]["competencies"][0]
    assert competency["average_current_score"] is None
    assert competency["suppressed"] is True


# ---------------------------------------------------------------------------
# The CSV export
# ---------------------------------------------------------------------------


def test_the_export_is_a_csv_with_a_timestamped_filename():
    client = build_client(reporting_connection())

    response = client.get(
        "/api/v1/teacher-admin/reports/progress.csv", headers=ADVISER_HEADERS
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    disposition = response.headers["content-disposition"]
    assert "mathsmart-progress-" in disposition
    assert disposition.endswith('.csv"')


def test_the_export_neutralises_a_formula():
    """A cell starting with = is executed by spreadsheet software."""
    client = build_client(reporting_connection())

    response = client.get(
        "/api/v1/teacher-admin/reports/progress.csv", headers=ADVISER_HEADERS
    )

    rows = list(csv.reader(io.StringIO(response.text)))
    assert rows[1][2].startswith("'=")


def test_the_export_carries_least_data():
    """No email address, no user id, nothing the report does not need."""
    client = build_client(reporting_connection())

    response = client.get(
        "/api/v1/teacher-admin/reports/progress.csv", headers=ADVISER_HEADERS
    )

    header = next(csv.reader(io.StringIO(response.text)))
    assert "email" not in [column.lower() for column in header]
    assert "user_id" not in [column.lower() for column in header]


def test_the_export_is_audited():
    connection = reporting_connection()
    client = build_client(connection)

    client.get("/api/v1/teacher-admin/reports/progress.csv", headers=ADVISER_HEADERS)

    audited = [call for call in connection.calls if AUDIT in call[0]]
    assert audited
    assert "report.exported" in audited[0][1]


def test_the_export_needs_a_live_session():
    client = build_client(reporting_connection(), live_session=False)

    response = client.get(
        "/api/v1/teacher-admin/reports/progress.csv", headers=ADVISER_HEADERS
    )

    assert response.status_code == 401


def test_a_learner_cannot_export():
    connection = reporting_connection()
    client = build_client(connection)

    response = client.get(
        "/api/v1/teacher-admin/reports/progress.csv", headers=LEARNER_HEADERS
    )

    assert response.status_code == 403
    assert not [call for call in connection.calls if AUDIT in call[0]]


# ---------------------------------------------------------------------------
# The filters reach every half of the payload
# ---------------------------------------------------------------------------
# The totals sit beside the competency rollup and the priority learners in one
# response. If the totals ignored the filters, two halves of the same payload
# would describe different cohorts with nothing telling the client.


def _args_for(connection, fragment):
    matched = [args for statement, args in connection.calls if fragment in statement]
    assert matched, fragment
    return matched[0]


def test_the_dashboard_totals_honour_the_grade_and_section_filters():
    connection = reporting_connection()
    client = build_client(connection)

    response = client.get(
        "/api/v1/teacher-admin/dashboard",
        params={"grade_id": str(GRADE), "section_id": str(SECTION)},
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 200
    assert _args_for(connection, DASHBOARD) == (GRADE, SECTION)


def test_the_dashboard_competencies_honour_the_section_filter():
    connection = reporting_connection()
    client = build_client(connection)

    client.get(
        "/api/v1/teacher-admin/dashboard",
        params={"grade_id": str(GRADE), "section_id": str(SECTION)},
        headers=ADVISER_HEADERS,
    )

    assert _args_for(connection, COMPETENCIES) == (GRADE, SECTION)


def test_analytics_totals_honour_the_grade_and_section_filters():
    connection = reporting_connection()
    client = build_client(connection)

    response = client.get(
        "/api/v1/teacher-admin/analytics",
        params={"grade_id": str(GRADE), "section_id": str(SECTION)},
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 200
    assert _args_for(connection, DASHBOARD) == (GRADE, SECTION)
    assert _args_for(connection, COMPETENCIES) == (GRADE, SECTION)


def test_every_reporting_statement_binds_exactly_what_it_references():
    connection = reporting_connection()
    client = build_client(connection)

    client.get(
        "/api/v1/teacher-admin/dashboard",
        params={"grade_id": str(GRADE), "section_id": str(SECTION)},
        headers=ADVISER_HEADERS,
    )

    assert connection.calls
    for statement, args in connection.calls:
        numbers = {int(number) for number in re.findall(r"\$(\d+)", statement)}
        highest = max(numbers, default=0)
        assert numbers == set(range(1, highest + 1)), statement
        assert len(args) == highest, statement
