"""Progress routes.

`GET /progress/me` and `GET /progress/{student_id}` answer the same question
from the same statements. The difference is who may ask about whom: a learner
asks about themselves, and naming a learner is a Teacher/Administrator's action
— which the policies enforce a second time, so a mistake here is not the only
thing standing between one learner and another's record.

Growth is a subtraction, not an opinion, and the recommended next action is the
first available item of the learner's own path.
"""

from uuid import UUID

from modules.shared.testing import (
    ADVISER_HEADERS,
    LEARNER,
    LEARNER_HEADERS,
    FakeConnection,
    build_client,
)

STUDENT_ID = UUID("58000000-0000-4000-8000-000000000001")
OTHER_STUDENT = UUID("58000000-0000-4000-8000-0000000000ff")
COMPETENCY = UUID("13ec5f06-746e-45fb-a58a-92f4ce42621c")
MODULE = UUID("4a39d286-e93e-4e75-9644-b873fcac185c")
ACTIVITY = UUID("fd80cc3c-4951-439c-894e-f93cbf7a23e1")

SUMMARY = "from app.student_performance_summary"
OWN_SUPPORT = "app.own_open_intervention_count()"
OWN_STUDENT = "where student_profiles.user_id = $1"
COMPETENCIES = "from app.competency_progress"
# The path list, the path totals and the competency total all read
# `app.learning_path_items` or `app.competencies`, so each fragment below names
# a column only its own statement selects. A fragment shared by two statements
# would hand one of them the other's rows.
PATH = "learning_path_items.path_item_id"
TRAJECTORY = "from app.activity_attempts"
COMPETENCY_TOTAL = "count(*) as total_competencies"
PATH_MODULE_TOTALS = "count(*) as total_path_modules"

SUMMARY_ROW = {
    "student_id": STUDENT_ID,
    "learner_id": "STU-2026-001",
    "full_name": "Juan Dela Cruz",
    "grade_id": None,
    "section_id": None,
    "monitoring_status": "needs_intervention",
    "diagnostic_average": 48,
    "current_average": 63,
    "competencies_mastered": 1,
    "modules_completed": 1,
    "modules_started": 3,
    "scored_attempt_count": 2,
    "worst_unsuccessful_attempts": 1,
    "open_intervention_count": 1,
    "last_studied_at": None,
}

COMPETENCY_ROW = {
    "competency_id": COMPETENCY,
    "competency_code": "MATH6-INT-02",
    "competency_name": "Multiplication and Division of Integers",
    "diagnostic_score": 35,
    "current_score": 78,
    "mastery_band": "Developing",
    "attempt_count": 2,
    "unsuccessful_attempts": 1,
    "last_studied_at": None,
}

PATH_ROW = {
    "path_item_id": UUID("821a14d6-c49a-4f42-bc04-96388ec76a31"),
    "priority": 1,
    "status": "available",
    "module_id": MODULE,
    "module_title": "Integer Sign Rules",
    "competency_id": COMPETENCY,
}

PATH_TOTALS_ROW = {"total_path_modules": 4, "completed_path_modules": 1}

TRAJECTORY_ROW = {
    "competency_id": COMPETENCY,
    "occurred_at": None,
    "score": 78,
    "label": "Activity Attempt 2",
    "activity_id": ACTIVITY,
    "title": "Integer Sign Practice",
}


def progress_connection(**overrides):
    results = {
        OWN_STUDENT: STUDENT_ID,
        SUMMARY: SUMMARY_ROW,
        COMPETENCIES: [COMPETENCY_ROW],
        PATH: [PATH_ROW],
        TRAJECTORY: [TRAJECTORY_ROW],
        COMPETENCY_TOTAL: 18,
        PATH_MODULE_TOTALS: PATH_TOTALS_ROW,
        OWN_SUPPORT: 2,
    }
    results.update(overrides)
    return FakeConnection(results=results)


def test_a_learner_reads_their_own_progress():
    client = build_client(progress_connection())

    response = client.get("/api/v1/progress/me", headers=LEARNER_HEADERS)

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["student_id"] == str(STUDENT_ID)
    assert data["overall_mastery"] == 63
    assert data["diagnostic_score"] == 48
    assert data["modules_completed_count"] == 1
    assert data["total_modules_count"] == 4
    # The learner's own count, from the function that can see past the table
    # policy — not the summary view's figure, which is 0 for every learner.
    assert data["active_intervention_count"] == 2


def test_a_learners_support_count_comes_from_their_own_function():
    connection = progress_connection()
    client = build_client(connection)

    client.get("/api/v1/progress/me", headers=LEARNER_HEADERS)

    calls = [query for query in connection.queries() if OWN_SUPPORT in query]
    assert len(calls) == 1
    # It takes nothing from the request: the caller is auth.uid(), never an
    # identifier a browser could change.
    args = next(args for query, args in connection.calls if OWN_SUPPORT in query)
    assert args == ()


def test_a_learner_with_no_open_support_reads_zero():
    client = build_client(progress_connection(**{OWN_SUPPORT: None}))

    data = client.get("/api/v1/progress/me", headers=LEARNER_HEADERS).json()["data"]

    assert data["active_intervention_count"] == 0


def test_an_educator_reading_a_learner_gets_the_summary_count():
    connection = progress_connection()
    client = build_client(connection)

    response = client.get(f"/api/v1/progress/{STUDENT_ID}", headers=ADVISER_HEADERS)

    assert response.status_code == 200
    # An educator can see the rows, so the view's own count is right for them,
    # and the learner-only function is not asked at all.
    assert response.json()["data"]["active_intervention_count"] == 1
    assert not [query for query in connection.queries() if OWN_SUPPORT in query]


def test_growth_is_the_difference_between_the_diagnostic_and_now():
    client = build_client(progress_connection())

    response = client.get("/api/v1/progress/me", headers=LEARNER_HEADERS)

    assert response.json()["data"]["growth"] == 15
    assert response.json()["data"]["competencies"][0]["growth"] == 43


def response_action(client):
    return client.get("/api/v1/progress/me", headers=LEARNER_HEADERS).json()["data"][
        "recommended_next_action"
    ]


def test_the_recommended_next_action_is_the_first_available_path_item():
    action = response_action(build_client(progress_connection()))

    assert action["type"] == "module"
    assert action["resource_id"] == str(MODULE)
    assert "Integer Sign Rules" in action["label"]


def test_a_learner_with_no_path_is_sent_to_the_diagnostic_that_would_build_one():
    """Nothing but the diagnostic writes a path, so an empty path names that step."""
    client = build_client(progress_connection(**{PATH: []}))

    action = response_action(client)
    assert action["type"] == "diagnostic"
    assert action["resource_id"] is None


def test_a_finished_path_is_not_the_same_answer_as_an_unstarted_one():
    """A client routes on `type`, so the two must not share one."""
    finished = dict(PATH_ROW, status="completed")
    client = build_client(progress_connection(**{PATH: [finished]}))

    action = response_action(client)
    assert action["type"] == "path_complete"
    assert action["resource_id"] is None
    unstarted = response_action(build_client(progress_connection(**{PATH: []})))
    assert action["type"] != unstarted["type"]


def test_the_competency_denominator_is_the_published_grade_total():
    """Counting only attempted competencies is what produces "2 of 2 mastered"."""
    client = build_client(progress_connection())

    data = client.get("/api/v1/progress/me", headers=LEARNER_HEADERS).json()["data"]
    assert data["total_competencies_count"] == 18
    assert data["competencies_mastered_count"] == 1
    assert len(data["competencies"]) == 1


def test_a_learner_who_has_attempted_nothing_still_has_a_grade_to_measure_against():
    """The denominator is the curriculum, so it does not wait for a first attempt."""
    summary = dict(SUMMARY_ROW, competencies_mastered=0, scored_attempt_count=0)
    client = build_client(progress_connection(**{COMPETENCIES: [], SUMMARY: summary}))

    data = client.get("/api/v1/progress/me", headers=LEARNER_HEADERS).json()["data"]
    assert data["competencies"] == []
    assert data["competencies_mastered_count"] == 0
    assert data["total_competencies_count"] == 18


def test_the_competency_total_is_asked_about_this_learner():
    """The published total is scoped by the learner's own grade, not the platform's."""
    connection = progress_connection()
    client = build_client(connection)

    client.get("/api/v1/progress/me", headers=LEARNER_HEADERS)

    _query, args = next(call for call in connection.calls if COMPETENCY_TOTAL in call[0])
    assert args == (STUDENT_ID,)


def test_the_module_fraction_is_counted_over_the_learners_own_path():
    connection = progress_connection(
        **{
            PATH_MODULE_TOTALS: {
                "total_path_modules": 6,
                "completed_path_modules": 2,
            }
        }
    )
    client = build_client(connection)

    data = client.get("/api/v1/progress/me", headers=LEARNER_HEADERS).json()["data"]
    assert data["total_modules_count"] == 6
    assert data["modules_completed_count"] == 2

    _query, args = next(call for call in connection.calls if PATH_MODULE_TOTALS in call[0])
    assert args == (STUDENT_ID,)


def test_a_module_finished_outside_the_path_does_not_outrun_the_path_total():
    """The rollup counts every module the learner ever finished; the fraction may not."""
    summary = dict(SUMMARY_ROW, modules_completed=9)
    client = build_client(progress_connection(**{SUMMARY: summary}))

    data = client.get("/api/v1/progress/me", headers=LEARNER_HEADERS).json()["data"]
    assert data["modules_completed_count"] == 1
    assert data["modules_completed_count"] <= data["total_modules_count"]


def test_a_learner_with_no_path_has_no_module_fraction_to_show():
    client = build_client(
        progress_connection(
            **{
                PATH: [],
                PATH_MODULE_TOTALS: {"total_path_modules": 0, "completed_path_modules": 0},
            }
        )
    )

    data = client.get("/api/v1/progress/me", headers=LEARNER_HEADERS).json()["data"]
    assert data["total_modules_count"] == 0
    assert data["modules_completed_count"] == 0


def test_the_evidence_behind_a_monitoring_status_is_reported_with_it():
    client = build_client(progress_connection())

    data = client.get("/api/v1/progress/me", headers=LEARNER_HEADERS).json()["data"]
    assert data["monitoring_status"] == "needs_intervention"
    assert data["scored_attempt_count"] == 2
    assert data["worst_unsuccessful_attempts"] == 1


def test_a_competency_reports_how_many_attempts_it_rests_on():
    client = build_client(progress_connection())

    competency = client.get("/api/v1/progress/me", headers=LEARNER_HEADERS).json()["data"][
        "competencies"
    ][0]
    assert competency["attempt_count"] == 2
    assert competency["unsuccessful_attempts"] == 1


def test_a_single_attempt_is_reported_as_a_single_attempt():
    """Thin evidence stays visibly thin rather than being rounded up into a verdict."""
    thin = dict(
        COMPETENCY_ROW,
        attempt_count=1,
        unsuccessful_attempts=0,
        diagnostic_score=None,
        current_score=52,
        mastery_band="Needs Improvement",
    )
    summary = dict(SUMMARY_ROW, scored_attempt_count=1, worst_unsuccessful_attempts=0)
    client = build_client(progress_connection(**{COMPETENCIES: [thin], SUMMARY: summary}))

    data = client.get("/api/v1/progress/me", headers=LEARNER_HEADERS).json()["data"]
    competency = data["competencies"][0]
    assert competency["attempt_count"] == 1
    assert competency["unsuccessful_attempts"] == 0
    assert competency["growth"] is None
    assert competency["mastery_band"] == "Needs Improvement"
    assert data["scored_attempt_count"] == 1
    assert data["worst_unsuccessful_attempts"] == 0


def test_missing_evidence_counts_are_zero_rather_than_null():
    """A dashboard divides by these, so a null would become "null of null"."""
    summary = dict(
        SUMMARY_ROW,
        competencies_mastered=None,
        scored_attempt_count=None,
        worst_unsuccessful_attempts=None,
    )
    empty = dict(COMPETENCY_ROW, attempt_count=None, unsuccessful_attempts=None)
    client = build_client(progress_connection(**{SUMMARY: summary, COMPETENCIES: [empty]}))

    data = client.get("/api/v1/progress/me", headers=LEARNER_HEADERS).json()["data"]
    assert data["competencies_mastered_count"] == 0
    assert data["scored_attempt_count"] == 0
    assert data["worst_unsuccessful_attempts"] == 0
    assert data["competencies"][0]["attempt_count"] == 0
    assert data["competencies"][0]["unsuccessful_attempts"] == 0


def test_a_competency_carries_its_trajectory():
    client = build_client(progress_connection())

    response = client.get("/api/v1/progress/me", headers=LEARNER_HEADERS)

    competency = response.json()["data"]["competencies"][0]
    assert competency["trajectory"][0]["score"] == 78
    assert competency["trajectory"][0]["label"] == "Activity Attempt 2"


def test_a_teacher_admin_has_no_learner_record_of_their_own():
    client = build_client(progress_connection(**{OWN_STUDENT: None}))

    response = client.get("/api/v1/progress/me", headers=ADVISER_HEADERS)

    assert response.status_code == 403


def test_a_learner_may_name_themselves():
    client = build_client(progress_connection())

    response = client.get(f"/api/v1/progress/{STUDENT_ID}", headers=LEARNER_HEADERS)

    assert response.status_code == 200


def test_a_learner_may_not_name_another_learner():
    connection = progress_connection()
    client = build_client(connection)

    response = client.get(f"/api/v1/progress/{OTHER_STUDENT}", headers=LEARNER_HEADERS)

    assert response.status_code == 403
    assert not [call for call in connection.calls if SUMMARY in call[0]]


def test_a_teacher_admin_may_name_any_learner():
    client = build_client(progress_connection())

    response = client.get(f"/api/v1/progress/{OTHER_STUDENT}", headers=ADVISER_HEADERS)

    assert response.status_code == 200


def test_a_learner_who_has_no_record_is_not_found():
    client = build_client(progress_connection(**{SUMMARY: None}))

    response = client.get(f"/api/v1/progress/{OTHER_STUDENT}", headers=ADVISER_HEADERS)

    assert response.status_code == 404


def test_progress_needs_a_token():
    client = build_client(FakeConnection())

    assert client.get("/api/v1/progress/me").status_code == 401


def test_the_learner_identity_comes_from_the_token():
    """`/progress/me` never reads a learner identifier from the request."""
    connection = progress_connection()
    client = build_client(connection)

    client.get("/api/v1/progress/me", headers=LEARNER_HEADERS)

    _query, args = next(call for call in connection.calls if OWN_STUDENT in call[0])
    assert args == (LEARNER,)
