"""Learning module routes.

The reads behave like the competency reads: one statement, and Row Level
Security decides how much of it comes back.

The writes are the interesting part. A learner's record is SELECT-only for the
`authenticated` role, so section progress is saved through
`app.save_module_progress`, which derives the learner from `auth.uid()` and
computes the completion percentage from the module's own content. That means
these tests check who may call it and what the route does with the answer; that
the arithmetic is right, and that one learner cannot write another's row, is
proved against PostgreSQL in `supabase/tests/520_learner_write_functions_test.sql`.
"""

from uuid import UUID

import pytest

from modules.learning_modules import service
from modules.shared.testing import (
    ADVISER_HEADERS,
    LEARNER_HEADERS,
    FakeConnection,
    build_client,
)

MODULE = UUID("4a39d286-e93e-4e75-9644-b873fcac185c")
COMPETENCY = UUID("13ec5f06-746e-45fb-a58a-92f4ce42621c")
GRADE = UUID("3f0f0000-0000-4000-8000-000000000006")
ACTIVITY = UUID("fd80cc3c-4951-439c-894e-f93cbf7a23e1")
STUDENT_ID = UUID("58000000-0000-4000-8000-000000000001")

RULES = [{"title": "Same signs", "rule_formula": "(-a) x (-b) = +(ab)"}]
EXAMPLES = [{"problem": "(-6) x (-4)", "steps": ["Apply the rule."], "solution": "24"}]

LIST_ROW = {
    "module_id": MODULE,
    "competency_id": COMPETENCY,
    "competency_name": "Multiplication and Division of Integers",
    "grade_id": GRADE,
    "title": "Multiplication and Division of Integers",
    "estimated_minutes": 15,
    "status": "published",
    "order_index": 1,
    "path_status": "available",
    "completion_percentage": 50,
    "is_complete": False,
}

DETAIL_ROW = {
    **LIST_ROW,
    "learning_objective": "Apply sign rules.",
    "short_explanation": "Equal signs give a positive result.",
    "rules": RULES,
    "worked_examples": EXAMPLES,
}

ACTIVITY_ROW = {"activity_id": ACTIVITY, "title": "Integer Sign Practice", "status": "published"}

SAVED_ROW = {
    "completion_percentage": 50,
    "is_complete": False,
    "completed_section_ids": ["objective", "concept"],
    "last_section_id": "concept",
    "started_at": None,
    "completed_at": None,
}

FINISHED_ROW = {
    **SAVED_ROW,
    "completion_percentage": 100,
    "is_complete": True,
    "completed_section_ids": ["objective", "concept", "rule_1", "example_1"],
}


def module_connection(**overrides):
    results = {
        "app.save_module_progress": SAVED_ROW,
        "app.complete_module": FINISHED_ROW,
        "from app.learning_modules": DETAIL_ROW,
        "from app.activities": [ACTIVITY_ROW],
        "from app.student_module_progress": SAVED_ROW,
    }
    results.update(overrides)
    return FakeConnection(results=results)


# ---------------------------------------------------------------------------
# Sections are counted from the module's own content
# ---------------------------------------------------------------------------


def test_a_modules_sections_are_its_objective_concept_rules_and_examples():
    assert service.section_ids(rules=RULES, worked_examples=EXAMPLES) == [
        "objective",
        "concept",
        "rule_1",
        "example_1",
    ]


def test_a_module_with_no_rules_or_examples_still_has_two_sections():
    assert service.section_ids(rules=[], worked_examples=[]) == ["objective", "concept"]


def test_sections_are_counted_from_jsonb_text_as_well_as_from_a_list():
    """asyncpg hands jsonb back as text."""
    assert service.section_ids(rules="[{}, {}]", worked_examples="[]") == [
        "objective",
        "concept",
        "rule_1",
        "rule_2",
    ]


# ---------------------------------------------------------------------------
# Reads
# ---------------------------------------------------------------------------


def test_a_learner_can_list_modules():
    connection = FakeConnection(results={"count(*)": 1, "from app.learning_modules": [LIST_ROW]})
    client = build_client(connection)

    response = client.get("/api/v1/modules", headers=LEARNER_HEADERS)

    assert response.status_code == 200
    module = response.json()["data"][0]
    assert module["title"] == "Multiplication and Division of Integers"
    assert module["path_status"] == "available"
    assert module["completion_percentage"] == 50


def test_the_documented_module_filters_reach_the_query():
    connection = FakeConnection(results={"count(*)": 1, "from app.learning_modules": [LIST_ROW]})
    client = build_client(connection)

    client.get(
        "/api/v1/modules",
        params={
            "competency_id": str(COMPETENCY),
            "grade_id": str(GRADE),
            "status": "published",
            "search": "integers",
        },
        headers=ADVISER_HEADERS,
    )

    _, args = connection.calls[0]
    assert COMPETENCY in args
    assert GRADE in args
    assert "published" in args
    assert "integers" in args


def test_a_module_detail_carries_its_rules_examples_activities_and_sections():
    client = build_client(module_connection())

    response = client.get(f"/api/v1/modules/{MODULE}", headers=LEARNER_HEADERS)

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["rules"][0]["title"] == "Same signs"
    assert data["worked_examples"][0]["solution"] == "24"
    assert data["associated_activities"][0]["title"] == "Integer Sign Practice"
    assert data["section_ids"] == ["objective", "concept", "rule_1", "example_1"]
    assert data["progress"]["completion_percentage"] == 50


def test_a_module_the_caller_cannot_see_is_not_found():
    client = build_client(FakeConnection())

    response = client.get(f"/api/v1/modules/{MODULE}", headers=LEARNER_HEADERS)

    assert response.status_code == 404


@pytest.mark.parametrize("path", ["/api/v1/modules", f"/api/v1/modules/{MODULE}"])
def test_module_reads_need_a_token(path):
    client = build_client(FakeConnection())

    assert client.get(path).status_code == 401


# ---------------------------------------------------------------------------
# Saving section progress
# ---------------------------------------------------------------------------


def test_saving_progress_returns_what_the_database_computed():
    """The percentage is the database's answer, not the caller's."""
    connection = module_connection()
    client = build_client(connection)

    response = client.patch(
        f"/api/v1/modules/{MODULE}/progress",
        json={"completed_section_ids": ["objective", "concept"], "last_section_id": "concept"},
        headers=LEARNER_HEADERS,
    )

    assert response.status_code == 200
    assert response.json()["data"]["completion_percentage"] == 50
    assert response.json()["data"]["is_complete"] is False


def test_saving_progress_sends_only_the_module_and_the_sections():
    """Nothing identifying a learner is passed; the function reads auth.uid()."""
    connection = module_connection()
    client = build_client(connection)

    client.patch(
        f"/api/v1/modules/{MODULE}/progress",
        json={"completed_section_ids": ["objective"], "last_section_id": "objective"},
        headers=LEARNER_HEADERS,
    )

    _query, args = next(
        call for call in connection.calls if "app.save_module_progress" in call[0]
    )
    assert args == (MODULE, ["objective"], "objective")


def test_a_teacher_admin_does_not_save_learner_progress():
    connection = module_connection()
    client = build_client(connection)

    response = client.patch(
        f"/api/v1/modules/{MODULE}/progress",
        json={"completed_section_ids": ["objective"]},
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 403
    assert not [call for call in connection.calls if "app.save_module_progress" in call[0]]


def test_a_progress_request_cannot_name_a_learner():
    client = build_client(module_connection())

    response = client.patch(
        f"/api/v1/modules/{MODULE}/progress",
        json={"completed_section_ids": ["objective"], "student_id": str(STUDENT_ID)},
        headers=LEARNER_HEADERS,
    )

    assert response.status_code == 422
    assert "student_id" in response.json()["error"]["fields"]


# ---------------------------------------------------------------------------
# Completion
# ---------------------------------------------------------------------------


def test_a_module_with_every_section_finished_completes():
    client = build_client(module_connection())

    response = client.post(f"/api/v1/modules/{MODULE}/complete", headers=LEARNER_HEADERS)

    assert response.status_code == 200
    assert response.json()["data"]["is_complete"] is True
    assert response.json()["data"]["completion_percentage"] == 100


def test_completing_a_module_with_unfinished_sections_is_refused():
    """The function returns no row, and the route says so with 412."""
    client = build_client(module_connection(**{"app.complete_module": None}))

    response = client.post(f"/api/v1/modules/{MODULE}/complete", headers=LEARNER_HEADERS)

    assert response.status_code == 412
    assert response.json()["error"]["code"] == "sections_incomplete"


def test_a_teacher_admin_does_not_complete_a_module():
    client = build_client(module_connection())

    response = client.post(f"/api/v1/modules/{MODULE}/complete", headers=ADVISER_HEADERS)

    assert response.status_code == 403


# ---------------------------------------------------------------------------
# Reading somebody's progress
# ---------------------------------------------------------------------------


def test_a_teacher_admin_can_read_a_learners_module_progress():
    client = build_client(module_connection())

    response = client.get(
        f"/api/v1/modules/{MODULE}/progress/{STUDENT_ID}", headers=ADVISER_HEADERS
    )

    assert response.status_code == 200
    assert response.json()["data"]["completion_percentage"] == 50


def test_a_learner_asking_for_another_learners_progress_is_refused():
    """The API refuses before the database has to, and RLS refuses as well."""
    client = build_client(module_connection())

    response = client.get(
        f"/api/v1/modules/{MODULE}/progress/{STUDENT_ID}", headers=LEARNER_HEADERS
    )

    assert response.status_code == 403


def test_progress_that_does_not_exist_is_not_found():
    client = build_client(module_connection(**{"from app.student_module_progress": None}))

    response = client.get(
        f"/api/v1/modules/{MODULE}/progress/{STUDENT_ID}", headers=ADVISER_HEADERS
    )

    assert response.status_code == 404
