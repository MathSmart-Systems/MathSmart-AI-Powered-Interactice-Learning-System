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
    "account_status": "active",
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


# ---------------------------------------------------------------------------
# Dropping a learner archives them; it never deletes their recorded work
# ---------------------------------------------------------------------------
#
# Seven tables reference app.student_profiles and every one of those foreign
# keys is ON DELETE RESTRICT, so a learner who has attempted anything cannot be
# removed. Archiving is the retention-safe outcome the schema was built for:
# the account-status check refuses the next request they make, and the class
# reporting that points at their history keeps working.


#: The roster listing, which is the statement that orders by learner id.
ROSTER_LIST = "order by student_profiles.learner_id"
#: Its total. Named precisely, because the per-section counts also count.
ROSTER_COUNT = "select count(*)"


def test_the_roster_says_whether_a_learner_is_still_active():
    """Dropping is invisible unless the roster can report it."""
    connection = student_connection(**{ROSTER_LIST: [ROW], ROSTER_COUNT: 1})
    client = build_client(connection)

    response = client.get("/api/v1/students", headers=ADVISER_HEADERS)

    assert response.status_code == 200
    assert response.json()["data"][0]["account_status"] == "active"


def test_a_dropped_learner_reads_as_archived():
    connection = student_connection(
        **{BY_STUDENT_ID: {**ROW, "account_status": "archived"}}
    )
    client = build_client(connection)

    response = client.get(f"/api/v1/students/{STUDENT_ID}", headers=ADVISER_HEADERS)

    assert response.status_code == 200
    assert response.json()["data"]["account_status"] == "archived"


def test_a_learner_record_survives_a_reply_without_the_status():
    """An older reply shape must not break the roster."""
    without = {key: value for key, value in ROW.items() if key != "account_status"}
    connection = student_connection(**{BY_STUDENT_ID: without})
    client = build_client(connection)

    response = client.get(f"/api/v1/students/{STUDENT_ID}", headers=ADVISER_HEADERS)

    assert response.status_code == 200
    assert response.json()["data"]["account_status"] is None


def test_there_is_no_route_that_deletes_a_learner():
    """The contract offers no way to destroy a learner's history."""
    connection = student_connection()
    client = build_client(connection)

    response = client.delete(f"/api/v1/students/{STUDENT_ID}", headers=ADVISER_HEADERS)

    assert response.status_code == 405
    assert not any("delete from app.student_profiles" in query for query in connection.queries())


# ---------------------------------------------------------------------------
# Dropping in bulk, which is what clearing a cohort at year end needs
# ---------------------------------------------------------------------------

#: The statements the drop route runs, each named by a fragment only it has.
DROPPABLE_IN_SECTION = "where student_profiles.section_id = $1"
DROPPABLE_NAMED = "where student_profiles.user_id = any($1::uuid[])"
KNOWN_LEARNERS = "select student_profiles.user_id\nfrom app.student_profiles\nwhere"
ARCHIVE = "app.set_account_status"
SECTION_COUNTS = "group by student_profiles.section_id"

OTHER_LEARNER = UUID("58000000-0000-4000-8000-0000000000aa")


def drop_connection(**overrides):
    """A connection that answers every statement the drop route makes."""
    results = {
        SECTION_PLACEMENT: {"grade_id": GRADE, "is_active": True},
        DROPPABLE_IN_SECTION: [{"user_id": LEARNER}, {"user_id": OTHER_LEARNER}],
        DROPPABLE_NAMED: [{"user_id": LEARNER}],
        KNOWN_LEARNERS: [{"user_id": LEARNER}],
        ARCHIVE: [{"user_id": LEARNER}],
    }
    results.update(overrides)
    return FakeConnection(results=results)


def test_a_whole_section_is_dropped_in_one_request():
    """Year end is a section, not forty separate clicks."""
    connection = drop_connection(
        **{ARCHIVE: [{"user_id": LEARNER}, {"user_id": OTHER_LEARNER}]}
    )
    client = build_client(connection)

    response = client.post(
        "/api/v1/students/drop", json={"section_id": str(SECTION)}, headers=ADVISER_HEADERS
    )

    assert response.status_code == 200
    assert response.json()["data"]["dropped"] == 2


def test_a_section_drop_reads_its_learners_from_the_database():
    """The roster is paginated, so the browser's page is not the section."""
    connection = drop_connection()
    client = build_client(connection)

    client.post(
        "/api/v1/students/drop", json={"section_id": str(SECTION)}, headers=ADVISER_HEADERS
    )

    assert any(DROPPABLE_IN_SECTION in query for query in connection.queries())
    archive = next(call for call in connection.calls if ARCHIVE in call[0])
    assert list(archive[1][0]) == [LEARNER, OTHER_LEARNER]


def test_named_learners_are_dropped():
    connection = drop_connection()
    client = build_client(connection)

    response = client.post(
        "/api/v1/students/drop",
        json={"user_ids": [str(LEARNER)]},
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 200
    assert response.json()["data"]["user_ids"] == [str(LEARNER)]


def test_an_account_that_is_not_a_learner_is_refused_by_name():
    """Naming a Teacher/Administrator must not read as a quiet success."""
    connection = drop_connection(**{DROPPABLE_NAMED: [], KNOWN_LEARNERS: []})
    client = build_client(connection)

    response = client.post(
        "/api/v1/students/drop",
        json={"user_ids": [str(LEARNER)]},
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "not_a_learner"
    assert str(LEARNER) in response.json()["error"]["fields"]["user_ids"]
    assert not any(ARCHIVE in query for query in connection.queries())


def test_dropping_an_already_dropped_section_changes_nothing():
    """Asking for a state that already holds is a success with no writes."""
    connection = drop_connection(**{DROPPABLE_IN_SECTION: []})
    client = build_client(connection)

    response = client.post(
        "/api/v1/students/drop", json={"section_id": str(SECTION)}, headers=ADVISER_HEADERS
    )

    assert response.status_code == 200
    assert response.json()["data"]["dropped"] == 0
    assert not any(ARCHIVE in query for query in connection.queries())


def test_a_section_that_does_not_exist_cannot_be_dropped():
    connection = drop_connection(**{SECTION_PLACEMENT: None})
    client = build_client(connection)

    response = client.post(
        "/api/v1/students/drop", json={"section_id": str(SECTION)}, headers=ADVISER_HEADERS
    )

    assert response.status_code == 404


def test_a_drop_names_exactly_one_target():
    client = build_client(drop_connection())

    for body in (
        {},
        {"user_ids": []},
        {"user_ids": [str(LEARNER)], "section_id": str(SECTION)},
    ):
        response = client.post("/api/v1/students/drop", json=body, headers=ADVISER_HEADERS)
        assert response.status_code == 422, body


def test_a_learner_cannot_drop_anybody():
    connection = drop_connection()
    client = build_client(connection)

    response = client.post(
        "/api/v1/students/drop", json={"section_id": str(SECTION)}, headers=LEARNER_HEADERS
    )

    assert response.status_code == 403
    assert not any(ARCHIVE in query for query in connection.queries())


def test_dropping_archives_and_never_deletes():
    """The whole point: no DELETE reaches a learner's records."""
    connection = drop_connection()
    client = build_client(connection)

    client.post(
        "/api/v1/students/drop", json={"section_id": str(SECTION)}, headers=ADVISER_HEADERS
    )

    assert any(ARCHIVE in query for query in connection.queries())
    assert not any("delete from" in query.lower() for query in connection.queries())


# ---------------------------------------------------------------------------
# A dropped learner leaves the roster
# ---------------------------------------------------------------------------


def test_the_roster_hides_dropped_learners_by_default():
    """A cleared cohort has to make the list shorter, or drop means nothing."""
    connection = student_connection(**{ROSTER_LIST: [ROW], ROSTER_COUNT: 1})
    client = build_client(connection)

    client.get("/api/v1/students", headers=ADVISER_HEADERS)

    listing = next(call for call in connection.calls if ROSTER_LIST in call[0])
    assert listing[1][-1] == "enrolled"


def test_the_roster_counts_every_section_not_just_the_page():
    """A section header offering select-all must say a true number."""
    connection = student_connection(
        **{
            ROSTER_LIST: [ROW],
            ROSTER_COUNT: 1,
            SECTION_COUNTS: [{"section_id": SECTION, "enrolled": 72, "dropped": 3}],
        }
    )
    client = build_client(connection)

    response = client.get("/api/v1/students", headers=ADVISER_HEADERS)

    sections = response.json()["meta"]["sections"]
    assert sections == [{"section_id": str(SECTION), "enrolled": 72, "dropped": 3}]


# ---------------------------------------------------------------------------
# Student Status: one question, asked in SQL
# ---------------------------------------------------------------------------

RESTORABLE = "sections.is_active as former_section_is_active"
RESTORE_UPDATE = "set section_id = $2"
RESTORE_ACCOUNT = "app.set_account_status($1, 'active'"
RETIRE_MONITORING = "set monitoring_status = 'inactive'"


def test_the_roster_asks_for_enrolled_learners_by_default():
    connection = student_connection(**{ROSTER_LIST: [ROW], ROSTER_COUNT: 1})
    client = build_client(connection)

    client.get("/api/v1/students", headers=ADVISER_HEADERS)

    listing = next(call for call in connection.calls if ROSTER_LIST in call[0])
    assert listing[1][-1] == "enrolled"


def test_the_roster_can_be_asked_for_dropped_learners_only():
    connection = student_connection(**{ROSTER_LIST: [ROW], ROSTER_COUNT: 1})
    client = build_client(connection)

    client.get("/api/v1/students?status=dropped", headers=ADVISER_HEADERS)

    listing = next(call for call in connection.calls if ROSTER_LIST in call[0])
    assert listing[1][-1] == "dropped"


def test_the_roster_can_be_asked_for_everybody():
    connection = student_connection(**{ROSTER_LIST: [ROW], ROSTER_COUNT: 1})
    client = build_client(connection)

    response = client.get("/api/v1/students?status=all", headers=ADVISER_HEADERS)

    assert response.json()["meta"]["status"] == "all"


def test_the_total_is_counted_under_the_same_status_as_the_page():
    """Otherwise a page of dropped learners reports the enrolled count."""
    connection = student_connection(**{ROSTER_LIST: [ROW], ROSTER_COUNT: 7})
    client = build_client(connection)

    client.get("/api/v1/students?status=dropped", headers=ADVISER_HEADERS)

    listing = next(call for call in connection.calls if ROSTER_LIST in call[0])
    counting = next(call for call in connection.calls if ROSTER_COUNT in call[0])
    assert listing[1][-1] == counting[1][-1] == "dropped"


def test_an_unknown_status_is_refused_rather_than_guessed():
    client = build_client(student_connection())

    response = client.get("/api/v1/students?status=everyone", headers=ADVISER_HEADERS)

    assert response.status_code == 422


def test_search_and_section_still_narrow_a_dropped_listing():
    connection = student_connection(**{ROSTER_LIST: [ROW], ROSTER_COUNT: 1})
    client = build_client(connection)

    client.get(
        f"/api/v1/students?status=dropped&section_id={SECTION}", headers=ADVISER_HEADERS
    )

    listing = next(call for call in connection.calls if ROSTER_LIST in call[0])
    assert SECTION in listing[1]
    assert listing[1][-1] == "dropped"


# ---------------------------------------------------------------------------
# Dropping retires the learning state as well as the access
# ---------------------------------------------------------------------------


def test_dropping_stops_monitoring_so_no_row_reads_active_and_dropped():
    connection = drop_connection()
    client = build_client(connection)

    client.post(
        "/api/v1/students/drop", json={"section_id": str(SECTION)}, headers=ADVISER_HEADERS
    )

    assert any(RETIRE_MONITORING in query for query in connection.queries())


# ---------------------------------------------------------------------------
# Restoring a dropped learner
# ---------------------------------------------------------------------------

DROPPED_ROW = {
    "student_id": STUDENT_ID,
    "user_id": LEARNER,
    "learner_id": "STU-2026-001",
    "full_name": "Juan Dela Cruz",
    "role": "student",
    "account_status": "archived",
    "former_section_id": SECTION,
    "former_section_name": "Rizal",
    "former_section_is_active": True,
    "former_section_grade_id": GRADE,
}


def restore_connection(**overrides):
    results = {
        RESTORABLE: DROPPED_ROW,
        SECTION_PLACEMENT: {"grade_id": GRADE, "is_active": True},
        GRADE_LEVEL: 6,
        RESTORE_UPDATE: {"student_id": STUDENT_ID},
        RESTORE_ACCOUNT: {"user_id": LEARNER},
        BY_STUDENT_ID: ROW,
    }
    results.update(overrides)
    return FakeConnection(results=results)


def restore(client, section_id=SECTION, headers=None):
    return client.post(
        f"/api/v1/students/{STUDENT_ID}/restore",
        json={"section_id": str(section_id)},
        headers=headers or ADVISER_HEADERS,
    )


def test_a_dropped_learner_is_restored_into_a_named_section():
    connection = restore_connection()
    client = build_client(connection)

    response = restore(client)

    assert response.status_code == 200
    placement = next(call for call in connection.calls if RESTORE_UPDATE in call[0])
    assert SECTION in placement[1]
    assert any(RESTORE_ACCOUNT in query for query in connection.queries())


def test_restoring_resumes_monitoring():
    connection = restore_connection()
    client = build_client(connection)

    restore(client)

    placement = next(call for call in connection.calls if RESTORE_UPDATE in call[0])
    assert "monitoring_status = 'active'" in placement[0]


def test_a_learner_who_was_never_dropped_cannot_be_restored():
    connection = restore_connection(**{RESTORABLE: dict(DROPPED_ROW, account_status="active")})
    client = build_client(connection)

    response = restore(client)

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "not_dropped"
    assert not any(RESTORE_UPDATE in query for query in connection.queries())


def test_a_teacher_admin_cannot_be_restored_through_this_route():
    connection = restore_connection(**{RESTORABLE: dict(DROPPED_ROW, role="teacher_admin")})
    client = build_client(connection)

    response = restore(client)

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "not_a_learner"


def test_restoring_into_another_grade_is_refused():
    """The interface offers only Grade 6; the interface is not the boundary."""
    connection = restore_connection(
        **{SECTION_PLACEMENT: {"grade_id": LEGACY_GRADE, "is_active": True}, GRADE_LEVEL: 3}
    )
    client = build_client(connection)

    response = restore(client, section_id=LEGACY_SECTION)

    assert response.status_code == 422
    assert not any(RESTORE_UPDATE in query for query in connection.queries())


def test_restoring_into_a_deactivated_section_is_refused():
    connection = restore_connection(
        **{SECTION_PLACEMENT: {"grade_id": GRADE, "is_active": False}}
    )
    client = build_client(connection)

    response = restore(client)

    assert response.status_code == 422
    assert not any(RESTORE_UPDATE in query for query in connection.queries())


def test_restoring_needs_a_live_session():
    client = build_client(restore_connection(), live_session=False)

    assert restore(client).status_code == 401


def test_a_learner_cannot_restore_anybody():
    connection = restore_connection()
    client = build_client(connection)

    response = restore(client, headers=LEARNER_HEADERS)

    assert response.status_code == 403
    assert not any(RESTORE_UPDATE in query for query in connection.queries())


def test_restoring_reads_no_learning_history():
    """Nothing is recalculated, which is provable: none of it is even read."""
    connection = restore_connection()
    client = build_client(connection)

    restore(client)

    history = (
        "assessment_attempts",
        "activity_attempts",
        "competency_progress",
        "competency_results",
        "student_module_progress",
        "learning_path_items",
        "interventions",
    )
    written = " ".join(connection.queries())
    for table in history:
        assert f"app.{table}" not in written, f"restore touched app.{table}"


def test_restoring_names_no_section_of_its_own():
    """The destination comes from the request, never from a guess."""
    client = build_client(restore_connection())

    response = client.post(
        f"/api/v1/students/{STUDENT_ID}/restore", json={}, headers=ADVISER_HEADERS
    )

    assert response.status_code == 422
