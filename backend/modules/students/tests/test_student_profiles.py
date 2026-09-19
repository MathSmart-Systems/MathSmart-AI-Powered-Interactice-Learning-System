"""Learner profile routes.

`PATCH /students/me` updates the caller's own display name — the one column
`authenticated` may write on its own profile. Naming a learner is a
Teacher/Administrator's action, and the fields they may change are the school's
own: section, grade and monitoring status. Neither route can change a role, an
account status or a learner id.
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
SECTION = UUID("cc7ef387-7435-4af0-8c50-0a7ce6aa5f5c")
GRADE = UUID("3f0f0000-0000-4000-8000-000000000006")

#: Reads the enrolment guard makes before a write: the grade's level, and the
#: grade and liveness of the section a learner is being placed in.
GRADE_LEVEL = "select grade_levels.level"
SECTION_PLACEMENT = "select sections.grade_id, sections.is_active"

OWN_LEARNER = "where student_profiles.user_id = $1"
BY_STUDENT_ID = "where student_profiles.student_id = $1"
PROFILE_UPDATE = "update app.user_profiles"
LEARNER_UPDATE = "update app.student_profiles"

ROW = {
    "student_id": STUDENT_ID,
    "user_id": LEARNER,
    "learner_id": "STU-2026-001",
    "full_name": "Juan Dela Cruz",
    "grade_id": GRADE,
    "section_id": SECTION,
    "grade_name": "Grade 6",
    "section_name": "Rizal",
    "school_name": "San Jose Elementary School",
    "monitoring_status": "active",
    "diagnostic_status": "completed",
}


def student_connection(**overrides):
    results = {
        GRADE_LEVEL: 6,
        SECTION_PLACEMENT: {"grade_id": GRADE, "is_active": True},
        OWN_LEARNER: ROW,
        BY_STUDENT_ID: ROW,
        PROFILE_UPDATE: ROW,
        LEARNER_UPDATE: ROW,
    }
    results.update(overrides)
    return FakeConnection(results=results)


def test_a_learner_updates_their_own_display_name():
    connection = student_connection()
    client = build_client(connection)

    response = client.patch(
        "/api/v1/students/me", json={"full_name": "Juan D. Cruz"}, headers=LEARNER_HEADERS
    )

    assert response.status_code == 200
    _query, args = next(call for call in connection.calls if PROFILE_UPDATE in call[0])
    assert "Juan D. Cruz" in args
    assert LEARNER in args


def test_a_learner_reads_their_own_record_with_enrollment_names():
    connection = student_connection()
    client = build_client(connection)

    response = client.get("/api/v1/students/me", headers=LEARNER_HEADERS)

    assert response.status_code == 200
    record = response.json()["data"]
    assert record["learner_id"] == "STU-2026-001"
    assert record["grade_name"] == "Grade 6"
    assert record["section_name"] == "Rizal"
    assert record["school_name"] == "San Jose Elementary School"
    assert record["monitoring_status"] == "active"
    assert record["diagnostic_status"] == "completed"


def test_an_unassigned_learner_has_null_enrollment_names():
    unassigned = dict(ROW, grade_id=None, section_id=None, grade_name=None, section_name=None)
    client = build_client(student_connection(**{OWN_LEARNER: unassigned}))

    response = client.get("/api/v1/students/me", headers=LEARNER_HEADERS)

    assert response.status_code == 200
    record = response.json()["data"]
    assert record["grade_name"] is None
    assert record["section_name"] is None
    assert record["school_name"] == "San Jose Elementary School"


def test_a_learner_cannot_change_their_own_role_or_status():
    client = build_client(student_connection())

    for field, value in (("role", "teacher_admin"), ("account_status", "active")):
        response = client.patch(
            "/api/v1/students/me", json={field: value}, headers=LEARNER_HEADERS
        )
        assert response.status_code == 422
        assert field in response.json()["error"]["fields"]


def test_a_learner_cannot_change_their_own_learner_id():
    client = build_client(student_connection())

    response = client.patch(
        "/api/v1/students/me", json={"learner_id": "STU-9999"}, headers=LEARNER_HEADERS
    )

    assert response.status_code == 422


def test_a_teacher_admin_reads_a_named_learner():
    client = build_client(student_connection())

    response = client.get(f"/api/v1/students/{STUDENT_ID}", headers=ADVISER_HEADERS)

    assert response.status_code == 200
    assert response.json()["data"]["learner_id"] == "STU-2026-001"


def test_a_learner_cannot_read_another_learner_by_id():
    connection = student_connection()
    client = build_client(connection)

    response = client.get(f"/api/v1/students/{STUDENT_ID}", headers=LEARNER_HEADERS)

    assert response.status_code == 403


def test_a_teacher_admin_moves_a_learner_between_sections():
    connection = student_connection()
    client = build_client(connection)

    response = client.patch(
        f"/api/v1/students/{STUDENT_ID}",
        json={"section_id": str(SECTION), "monitoring_status": "improving"},
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 200
    _query, args = next(call for call in connection.calls if LEARNER_UPDATE in call[0])
    assert SECTION in args
    assert "improving" in args


def test_changing_a_learner_record_needs_a_live_session():
    client = build_client(student_connection(), live_session=False)

    response = client.patch(
        f"/api/v1/students/{STUDENT_ID}",
        json={"monitoring_status": "improving"},
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 401


def test_a_learner_cannot_change_another_learners_record():
    connection = student_connection()
    client = build_client(connection)

    response = client.patch(
        f"/api/v1/students/{STUDENT_ID}",
        json={"monitoring_status": "mastered"},
        headers=LEARNER_HEADERS,
    )

    assert response.status_code == 403
    assert not [call for call in connection.calls if LEARNER_UPDATE in call[0]]


def test_a_learner_who_has_no_record_is_not_found():
    client = build_client(student_connection(**{BY_STUDENT_ID: None}))

    response = client.get(f"/api/v1/students/{STUDENT_ID}", headers=ADVISER_HEADERS)

    assert response.status_code == 404


# ---------------------------------------------------------------------------
# A learner is enrolled into the one grade MathSmart teaches, or not at all
# ---------------------------------------------------------------------------
#
# The interface never offers another grade, but the interface is not the
# boundary. These prove a crafted request cannot put a learner somewhere the
# curriculum does not reach.

LEGACY_GRADE = UUID("3f0f0000-0000-4000-8000-000000000003")
LEGACY_SECTION = UUID("cc7ef387-7435-4af0-8c50-0a7ce6aa5f5c")
ENROL_HEADERS = {**ADVISER_HEADERS, "Idempotency-Key": "enrol-key-000001"}

ENROLMENT = {
    "email": "learner@example.com",
    "full_name": "Juan Dela Cruz",
    "learner_id": "STU-2026-777",
    "grade_id": str(GRADE),
}


def test_a_learner_is_enrolled_into_grade_six():
    connection = student_connection()
    client = build_client(connection)

    response = client.post("/api/v1/students", json=ENROLMENT, headers=ENROL_HEADERS)

    # The enrolment itself runs on the elevated provisioning path, which this
    # client does not stand up; what matters here is that the scope guard let
    # it through rather than refusing it.
    assert response.status_code != 422
    assert any(GRADE_LEVEL in query for query in connection.queries())


def test_enrolling_into_another_grade_is_refused():
    connection = student_connection(**{GRADE_LEVEL: 3})
    client = build_client(connection)

    response = client.post(
        "/api/v1/students",
        json={**ENROLMENT, "grade_id": str(LEGACY_GRADE)},
        headers=ENROL_HEADERS,
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "grade_scope"
    assert "grade_id" in response.json()["error"]["fields"]


def test_enrolling_into_a_grade_that_does_not_exist_is_refused():
    connection = student_connection(**{GRADE_LEVEL: None})
    client = build_client(connection)

    response = client.post("/api/v1/students", json=ENROLMENT, headers=ENROL_HEADERS)

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "grade_scope"


class GradeAwareConnection(FakeConnection):
    """Answers the level lookup from the grade it was actually asked about.

    The shared fake matches on a query fragment alone, which cannot tell the
    learner's grade from the grade a section belongs to. This one reads the
    argument, which is the whole point of the test below.
    """

    def __init__(self, levels, **kwargs):
        super().__init__(**kwargs)
        self.levels = levels

    async def fetchval(self, query: str, *args):
        if GRADE_LEVEL in query:
            return self.levels.get(args[0])
        return await super().fetchval(query, *args)


def test_a_section_in_another_grade_cannot_hold_a_learner():
    """A Grade 6 grade_id with a section that belongs somewhere else."""
    connection = GradeAwareConnection(
        {GRADE: 6, LEGACY_GRADE: 3},
        results={
            SECTION_PLACEMENT: {"grade_id": LEGACY_GRADE, "is_active": True},
            BY_STUDENT_ID: ROW,
            LEARNER_UPDATE: ROW,
        },
    )
    client = build_client(connection)

    response = client.post(
        "/api/v1/students",
        json={**ENROLMENT, "section_id": str(LEGACY_SECTION)},
        headers=ENROL_HEADERS,
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "grade_scope"
    assert "section_id" in response.json()["error"]["fields"]


def test_a_deactivated_section_cannot_hold_a_learner():
    connection = student_connection(
        **{SECTION_PLACEMENT: {"grade_id": GRADE, "is_active": False}}
    )
    client = build_client(connection)

    response = client.post(
        "/api/v1/students",
        json={**ENROLMENT, "section_id": str(SECTION)},
        headers=ENROL_HEADERS,
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "grade_scope"
    assert "deactivated" in response.json()["error"]["message"]


def test_a_section_that_does_not_exist_is_refused():
    connection = student_connection(**{SECTION_PLACEMENT: None})
    client = build_client(connection)

    response = client.post(
        "/api/v1/students",
        json={**ENROLMENT, "section_id": str(SECTION)},
        headers=ENROL_HEADERS,
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "grade_scope"


def test_enrolling_with_no_section_checks_no_section():
    connection = student_connection()
    client = build_client(connection)

    client.post("/api/v1/students", json=ENROLMENT, headers=ENROL_HEADERS)

    assert not any(SECTION_PLACEMENT in query for query in connection.queries())


def test_the_scope_guard_runs_before_anything_is_provisioned():
    """A refused enrolment leaves no account behind to clean up."""
    connection = student_connection(**{GRADE_LEVEL: 3})
    client = build_client(connection)

    response = client.post(
        "/api/v1/students",
        json={**ENROLMENT, "grade_id": str(LEGACY_GRADE)},
        headers=ENROL_HEADERS,
    )

    assert response.status_code == 422
    assert not any("insert into app.student_profiles" in query for query in connection.queries())


def test_moving_a_learner_to_another_grade_is_refused():
    connection = student_connection(**{GRADE_LEVEL: 3})
    client = build_client(connection)

    response = client.patch(
        f"/api/v1/students/{STUDENT_ID}",
        json={"grade_id": str(LEGACY_GRADE)},
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "grade_scope"
    assert not any(LEARNER_UPDATE in query for query in connection.queries())


def test_moving_a_learner_into_a_deactivated_section_is_refused():
    connection = student_connection(
        **{SECTION_PLACEMENT: {"grade_id": GRADE, "is_active": False}}
    )
    client = build_client(connection)

    response = client.patch(
        f"/api/v1/students/{STUDENT_ID}",
        json={"section_id": str(SECTION)},
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 422
    assert not any(LEARNER_UPDATE in query for query in connection.queries())


def test_a_monitoring_change_alone_checks_no_enrolment():
    """Changing how a learner is watched is not an enrolment decision."""
    connection = student_connection()
    client = build_client(connection)

    response = client.patch(
        f"/api/v1/students/{STUDENT_ID}",
        json={"monitoring_status": "improving"},
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 200
    assert not any(GRADE_LEVEL in query for query in connection.queries())
    assert not any(SECTION_PLACEMENT in query for query in connection.queries())


def test_a_learner_cannot_enrol_anybody():
    connection = student_connection()
    client = build_client(connection)

    response = client.post("/api/v1/students", json=ENROLMENT, headers=LEARNER_HEADERS)

    assert response.status_code == 403
