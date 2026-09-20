"""Teacher/Administrator administration.

Curriculum authoring is an ordinary write through the actor connection: the
column grants already say which columns may be authored, and RLS already says
who may author them, so the API's job is to accept the documented fields and
nothing else.

The exceptions are the two things `authenticated` deliberately cannot write —
an account's status and a voided attempt — which go through audited functions,
and settings, which must never carry a credential or the Groq model.
"""

from uuid import UUID

from modules.shared.testing import (
    ADVISER_HEADERS,
    LEARNER_HEADERS,
    FakeConnection,
    build_client,
)

COMPETENCY = UUID("13ec5f06-746e-45fb-a58a-92f4ce42621c")
MODULE = UUID("4a39d286-e93e-4e75-9644-b873fcac185c")
QUESTION = UUID("a89d7d3f-8e80-4564-9681-11531088fab9")
ASSESSMENT = UUID("30e7f94d-0daa-4c0d-9a4b-908e47029a51")
GRADE = UUID("3f0f0000-0000-4000-8000-000000000006")
SECTION = UUID("cc7ef387-7435-4af0-8c50-0a7ce6aa5f5c")
USER = UUID("b0000000-0000-4000-8000-00000000000e")
STUDENT_ID = UUID("58000000-0000-4000-8000-000000000001")
ACTIVITY = UUID("7b2b0000-0000-4000-8000-000000000008")

TOTAL = "count(*) as total"

#: Distinctive fragments of the assessment membership statements, so a test can
#: answer one of them without answering the others.
READINESS = "as grade_is_active"
MEMBERSHIP_IDS = "order by assessment_questions.position"
MEMBERSHIP_COUNTS = "group by assessment_questions.assessment_id"

COMPETENCY_ROW = {
    "competency_id": COMPETENCY,
    "code": "MATH6-INT-02",
    "grade_id": GRADE,
    "domain": "Number Sense",
    "name": "Multiplication and Division of Integers",
    "description": "Apply sign rules.",
    "status": "draft",
    "prerequisite_ids": [],
    "created_at": None,
    "updated_at": None,
}

MODULE_ROW = {
    "module_id": MODULE,
    "competency_id": COMPETENCY,
    "title": "Multiplication and Division of Integers",
    "estimated_minutes": 15,
    "learning_objective": "Apply sign rules.",
    "short_explanation": "Equal signs give a positive result.",
    "rules": [],
    "worked_examples": [],
    "status": "draft",
    "version": 1,
    "order_index": 1,
    "created_at": None,
    "updated_at": None,
}

ACTIVITY_ROW = {
    "activity_id": ACTIVITY,
    "module_id": MODULE,
    "title": "Integers Multiplication Practice",
    "description": "Apply sign rules.",
    "estimated_minutes": 15,
    "points": 100,
    "mastery_threshold": 75,
    "status": "draft",
    "version": 1,
    "created_at": None,
    "updated_at": None,
}

QUESTION_ROW = {
    "question_id": QUESTION,
    "competency_id": COMPETENCY,
    "question_type": "number_input",
    "difficulty": "medium",
    "prompt": "What is 2 + 2?",
    "choices": [],
    "visual_aid_description": None,
    "status": "draft",
    "version": 1,
    "created_at": None,
    "updated_at": None,
}

ASSESSMENT_ROW = {
    "assessment_id": ASSESSMENT,
    "grade_id": GRADE,
    "title": "Grade 6 Mathematics Diagnostic Assessment",
    "assessment_type": "diagnostic",
    "status": "draft",
    "duration_minutes": 30,
    "description": None,
    "version": 1,
    "created_at": None,
    "updated_at": None,
}

#: An assessment that is ready to publish: it has questions, all of them are
#: published, and its grade level is still active.
READINESS_ROW = {
    "assessment_status": "draft",
    "grade_is_active": True,
    "question_total": 1,
    "unpublished_total": 0,
}

USER_ROW = {
    "user_id": USER,
    "full_name": "New Learner",
    "email": "new.learner@mathsmart.dev",
    "role": "student",
    "account_status": "active",
    "archived_at": None,
    "created_at": None,
}

SETTING_ROW = {
    "setting_key": "thresholds.activity_pass_percentage",
    "setting_value": 75,
    "updated_at": None,
}

AUDIT_ROW = {
    "audit_event_id": UUID("7c1f0000-0000-4000-8000-00000000000a"),
    "actor_user_id": UUID("a0000000-0000-4000-8000-0000000000a1"),
    "actor_role": "teacher_admin",
    "action": "report.exported",
    "target_type": "progress_report",
    "target_id": None,
    "request_id": "req_1",
    "details": {},
    "occurred_at": None,
}

ATTEMPT_ROW = {
    "attempt_id": UUID("5b2b9640-1cf7-4210-8910-dfd605d30d77"),
    "assessment_id": ASSESSMENT,
    "student_id": STUDENT_ID,
    "status": "voided",
    "overall_score": None,
    "started_at": None,
    "submitted_at": None,
    "voided_reason": "Interrupted by a power cut.",
    "voided_at": None,
}


#: The Grade 6 lookup the competency and section create routes both make,
#: named by the clause only that statement carries. `MVP_GRADE_READ` below is
#: the same fragment; this one exists because the fixture needs it first.
MVP_GRADE = "order by grade_levels.is_active desc"


def admin_connection(**overrides):
    """Build a mock database connection pre-populated with admin fixtures."""
    results = {
        TOTAL: 1,
        "from app.competencies": [COMPETENCY_ROW],
        "from app.learning_modules": [MODULE_ROW],
        "from app.activities": [ACTIVITY_ROW],
        "from app.questions": [QUESTION_ROW],
        # Ahead of the assessments listing, because the readiness statement
        # selects from app.assessments too and this fragment is the specific one.
        READINESS: READINESS_ROW,
        "from app.assessments": [ASSESSMENT_ROW],
        "from app.user_profiles": [USER_ROW],
        "from app.system_settings": [SETTING_ROW],
        "from app.audit_events": [AUDIT_ROW],
        "app.set_account_status": USER_ROW,
        "app.reset_diagnostic": ATTEMPT_ROW,
        "returning": COMPETENCY_ROW,
        # The create route resolves Grade 6 on the server now, so the fake has
        # to answer that read the way the seeded database does.
        MVP_GRADE: GRADE,
    }
    results.update(overrides)
    return FakeConnection(results=results)


# ---------------------------------------------------------------------------
# Curriculum authoring
# ---------------------------------------------------------------------------


def test_a_teacher_admin_lists_competency_drafts():
    client = build_client(admin_connection())

    response = client.get("/api/v1/teacher-admin/competencies", headers=ADVISER_HEADERS)

    assert response.status_code == 200
    assert response.json()["data"][0]["code"] == "MATH6-INT-02"


def test_module_status_filters_the_page_and_its_count():
    connection = admin_connection()
    client = build_client(connection)

    response = client.get(
        "/api/v1/teacher-admin/modules",
        params={"search": "integers", "status": "draft", "page": 2, "page_size": 10},
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 200
    module_calls = [call for call in connection.calls if "from app.learning_modules" in call[0]]
    assert len(module_calls) == 2
    assert module_calls[0][1] == ("integers", "draft", 10, 10)
    assert module_calls[1][1] == ("integers", "draft")
    assert all("learning_modules.status = $2" in query for query, _args in module_calls)


def test_a_learner_cannot_reach_administration():
    client = build_client(admin_connection())

    response = client.get("/api/v1/teacher-admin/competencies", headers=LEARNER_HEADERS)

    assert response.status_code == 403


def test_a_competency_draft_can_be_created():
    client = build_client(admin_connection())

    response = client.post(
        "/api/v1/teacher-admin/competencies",
        json={
            "code": "MATH6-INT-02",
            "name": "Multiplication and Division of Integers",
            "domain": "Number Sense",
            "description": "Apply sign rules.",
        },
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 201
    assert response.json()["data"]["code"] == "MATH6-INT-02"


def test_creating_a_competency_needs_a_live_session():
    client = build_client(admin_connection(), live_session=False)

    response = client.post(
        "/api/v1/teacher-admin/competencies",
        json={
            "code": "MATH6-INT-02",
            "name": "Multiplication and Division of Integers",
            "domain": "Number Sense",
        },
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 401


def test_a_competency_request_cannot_set_an_identifier():
    client = build_client(admin_connection())

    response = client.post(
        "/api/v1/teacher-admin/competencies",
        json={
            "competency_id": str(COMPETENCY),
            "code": "MATH6-INT-02",
            "name": "Multiplication and Division of Integers",
            "domain": "Number Sense",
        },
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 422


def _module_payload(**overrides):
    return {
        "competency_id": str(COMPETENCY),
        "title": "Multiplication and Division of Integers",
        "estimated_minutes": 15,
        "learning_objective": "Apply sign rules.",
        "short_explanation": "Equal signs give a positive result.",
        "rules": [],
        "worked_examples": [],
        "order_index": 1,
        **overrides,
    }


def test_a_published_module_requires_a_published_competency_on_create():
    connection = FakeConnection(results={"for share": None})
    client = build_client(connection)

    response = client.post(
        "/api/v1/teacher-admin/modules",
        json=_module_payload(status="published"),
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "module_not_publishable"
    assert not [call for call in connection.calls if "insert into app.learning_modules" in call[0]]


def test_a_published_module_requires_a_published_competency_on_update():
    connection = FakeConnection(
        results={
            "for update": MODULE_ROW,
            "for share": None,
        }
    )
    client = build_client(connection)

    response = client.patch(
        f"/api/v1/teacher-admin/modules/{MODULE}",
        json={"status": "published"},
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "module_not_publishable"
    assert not [call for call in connection.calls if "update app.learning_modules" in call[0]]


def test_a_published_module_locks_its_published_competency_before_update():
    published_module = {**MODULE_ROW, "status": "published"}
    connection = FakeConnection(
        results={
            "for update": published_module,
            "for share": COMPETENCY_ROW,
            "returning": published_module,
        },
    )
    client = build_client(connection)

    response = client.patch(
        f"/api/v1/teacher-admin/modules/{MODULE}",
        json={"title": "Updated integer module"},
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 200
    lock_index = next(
        index for index, call in enumerate(connection.calls) if "for share" in call[0]
    )
    write_index = next(
        index
        for index, call in enumerate(connection.calls)
        if "update app.learning_modules" in call[0]
    )
    assert lock_index < write_index


#: The statements the restore route runs, each named by a clause only it
#: carries, so a test can answer one without answering the others.
MODULE_RESTORE_READ = "as module_status"
MODULE_ORDER_TAKEN = "and learning_modules.module_id <> $3"
NEXT_MODULE_ORDER = "coalesce(max(learning_modules.order_index) + 1, 0)"


def test_an_archived_module_is_restored_into_the_place_it_left():
    """Nothing took the slot, so the module goes back exactly where it was."""
    connection = FakeConnection(
        results={
            MODULE_RESTORE_READ: {
                "competency_id": COMPETENCY,
                "title": MODULE_ROW["title"],
                "order_index": 1,
                "module_status": "archived",
            },
            MODULE_ORDER_TAKEN: None,
            "returning": MODULE_ROW,
        }
    )
    client = build_client(connection)

    response = client.post(
        f"/api/v1/teacher-admin/modules/{MODULE}/restore", headers=ADVISER_HEADERS
    )

    assert response.status_code == 200
    assert response.json()["data"]["order_index_changed"] is False

    update = next(call for call in connection.calls if "update app.learning_modules" in call[0])
    # Only the status is rewritten; the place is left alone.
    assert "order_index = $" not in update[0]


def test_a_restored_module_moves_when_its_place_was_taken():
    """Archiving frees the slot, so by restore time something else usually holds it.

    `learning_modules_competency_order_key` exempts archived rows, which is what
    made this the normal case rather than a rare one — and setting the status
    alone violated the index, reaching the teacher as "Another record already
    uses one of those values" on a control with no way to change the order.
    """
    connection = FakeConnection(
        results={
            MODULE_RESTORE_READ: {
                "competency_id": COMPETENCY,
                "title": MODULE_ROW["title"],
                "order_index": 1,
                "module_status": "archived",
            },
            MODULE_ORDER_TAKEN: MODULE,
            NEXT_MODULE_ORDER: 7,
            "returning": {**MODULE_ROW, "order_index": 7},
        }
    )
    client = build_client(connection)

    response = client.post(
        f"/api/v1/teacher-admin/modules/{MODULE}/restore", headers=ADVISER_HEADERS
    )

    assert response.status_code == 200
    body = response.json()["data"]
    assert body["order_index"] == 7
    # The teacher is told the module moved. A module that quietly changed place
    # in the learning path is not a detail.
    assert body["order_index_changed"] is True

    update = next(call for call in connection.calls if "update app.learning_modules" in call[0])
    assert "order_index = $" in update[0]
    assert 7 in update[1]


def test_the_restore_locks_the_module_before_it_reads_the_place():
    """The check and the write are one transaction, so the slot cannot move."""
    connection = FakeConnection(
        results={
            MODULE_RESTORE_READ: {
                "competency_id": COMPETENCY,
                "title": MODULE_ROW["title"],
                "order_index": 1,
                "module_status": "archived",
            },
            MODULE_ORDER_TAKEN: None,
            "returning": MODULE_ROW,
        }
    )
    client = build_client(connection)

    client.post(f"/api/v1/teacher-admin/modules/{MODULE}/restore", headers=ADVISER_HEADERS)

    queries = connection.queries()
    lock = next(index for index, query in enumerate(queries) if "for update" in query)
    check = next(index for index, query in enumerate(queries) if MODULE_ORDER_TAKEN in query)
    assert lock < check


def test_only_an_archived_module_can_be_restored():
    connection = FakeConnection(
        results={
            MODULE_RESTORE_READ: {
                "competency_id": COMPETENCY,
                "title": MODULE_ROW["title"],
                "order_index": 1,
                "module_status": "published",
            },
        }
    )
    client = build_client(connection)

    response = client.post(
        f"/api/v1/teacher-admin/modules/{MODULE}/restore", headers=ADVISER_HEADERS
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "module_not_archived"
    assert not [call for call in connection.calls if "update app.learning_modules" in call[0]]


def test_restoring_a_module_that_is_not_there_is_a_404():
    client = build_client(FakeConnection(results={}))

    response = client.post(
        f"/api/v1/teacher-admin/modules/{MODULE}/restore", headers=ADVISER_HEADERS
    )

    assert response.status_code == 404


def test_restoring_a_module_needs_a_live_session():
    connection = FakeConnection(
        results={
            MODULE_RESTORE_READ: {
                "competency_id": COMPETENCY,
                "title": MODULE_ROW["title"],
                "order_index": 1,
                "module_status": "archived",
            },
        }
    )
    client = build_client(connection, live_session=False)

    response = client.post(
        f"/api/v1/teacher-admin/modules/{MODULE}/restore", headers=ADVISER_HEADERS
    )

    assert response.status_code == 401


def test_a_learner_cannot_restore_a_module():
    client = build_client(FakeConnection(results={}))

    response = client.post(
        f"/api/v1/teacher-admin/modules/{MODULE}/restore", headers=LEARNER_HEADERS
    )

    assert response.status_code == 403


def test_a_module_order_collision_names_the_field_it_is_about():
    """The generic conflict sentence told a teacher nothing they could act on."""
    import asyncpg

    class ExplodingConnection(FakeConnection):
        async def fetchrow(self, query: str, *args):
            if "update app.learning_modules" in query:
                raise asyncpg.exceptions.UniqueViolationError(
                    "duplicate key value violates unique constraint "
                    '"learning_modules_competency_order_key"'
                )
            return await super().fetchrow(query, *args)

    connection = ExplodingConnection(
        results={
            "for update": MODULE_ROW,
            "for share": COMPETENCY_ROW,
        }
    )
    connection.results["learning_modules_competency_order_key"] = None
    # asyncpg carries the constraint name on the exception, not in the message.
    original = asyncpg.exceptions.UniqueViolationError.constraint_name
    asyncpg.exceptions.UniqueViolationError.constraint_name = (
        "learning_modules_competency_order_key"
    )
    try:
        client = build_client(connection)
        response = client.patch(
            f"/api/v1/teacher-admin/modules/{MODULE}",
            json={"order_index": 1},
            headers=ADVISER_HEADERS,
        )
    finally:
        asyncpg.exceptions.UniqueViolationError.constraint_name = original

    assert response.status_code == 409
    assert response.json()["error"]["fields"]["order_index"]
    assert "learning path" in response.json()["error"]["message"]
    # The constraint name stays in the log.
    assert "learning_modules_competency_order_key" not in response.text


def test_archiving_a_competency_does_not_delete_it():
    connection = admin_connection()
    client = build_client(connection)

    response = client.delete(
        f"/api/v1/teacher-admin/competencies/{COMPETENCY}", headers=ADVISER_HEADERS
    )

    assert response.status_code == 204
    archiving = [call for call in connection.calls if "set status = 'archived'" in call[0]]
    assert archiving
    assert not [call for call in connection.calls if "delete from app.competencies" in call[0]]


def test_a_teacher_admin_lists_activity_drafts():
    """Verify that a teacher administrator can retrieve a paginated list of activities."""
    client = build_client(admin_connection())

    response = client.get("/api/v1/teacher-admin/activities", headers=ADVISER_HEADERS)

    assert response.status_code == 200
    assert response.json()["data"][0]["title"] == "Integers Multiplication Practice"


def test_a_teacher_admin_filters_activities_by_status():
    """Verify that activities can be filtered by their publication status."""
    connection = admin_connection()
    client = build_client(connection)

    response = client.get(
        "/api/v1/teacher-admin/activities?status=draft", headers=ADVISER_HEADERS
    )

    assert response.status_code == 200
    assert any("status::text" in call[0] and "draft" in call[1] for call in connection.calls)


def test_a_teacher_admin_filters_activities_by_module():
    """Verify that activities can be filtered by their parent learning module ID."""
    connection = admin_connection()
    client = build_client(connection)

    response = client.get(
        f"/api/v1/teacher-admin/activities?module_id={MODULE}", headers=ADVISER_HEADERS
    )

    assert response.status_code == 200
    assert any(
        "activities.module_id =" in call[0] and MODULE in call[1]
        for call in connection.calls
    )


def test_an_activity_draft_can_be_created():
    """Verify that a new activity draft can be created with required attributes."""
    connection = admin_connection(**{"returning": ACTIVITY_ROW})
    client = build_client(connection)

    response = client.post(
        "/api/v1/teacher-admin/activities",
        json={
            "module_id": str(MODULE),
            "title": "Integers Multiplication Practice",
            "description": "Apply sign rules.",
            "estimated_minutes": 15,
            "points": 100,
            "mastery_threshold": 75,
        },
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 201
    assert response.json()["data"]["title"] == "Integers Multiplication Practice"


def test_creating_an_activity_needs_a_live_session():
    """Verify that creating an activity without a live session is refused with 401."""
    client = build_client(admin_connection(), live_session=False)

    response = client.post(
        "/api/v1/teacher-admin/activities",
        json={
            "module_id": str(MODULE),
            "title": "Integers Multiplication Practice",
            "estimated_minutes": 15,
        },
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 401


def test_an_activity_can_be_updated():
    """Verify that an existing activity draft can be partially updated."""
    updated = {**ACTIVITY_ROW, "points": 120}
    connection = admin_connection(**{"returning": updated})
    client = build_client(connection)

    response = client.patch(
        f"/api/v1/teacher-admin/activities/{ACTIVITY}",
        json={"points": 120},
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 200
    assert response.json()["data"]["points"] == 120


def test_archiving_an_activity_does_not_delete_it():
    """Verify that archiving an activity sets status to archived without deleting the row."""
    connection = admin_connection()
    client = build_client(connection)

    response = client.delete(
        f"/api/v1/teacher-admin/activities/{ACTIVITY}", headers=ADVISER_HEADERS
    )

    assert response.status_code == 204
    archiving = [call for call in connection.calls if "set status = 'archived'" in call[0]]
    assert archiving
    assert not [call for call in connection.calls if "delete from app.activities" in call[0]]


# ---------------------------------------------------------------------------
# The question bank
# ---------------------------------------------------------------------------


def test_a_question_can_be_authored_with_its_answer_key():
    connection = admin_connection(**{"returning": QUESTION_ROW})
    client = build_client(connection)

    response = client.post(
        "/api/v1/teacher-admin/questions",
        json={
            "competency_id": str(COMPETENCY),
            "question_type": "number_input",
            "difficulty": "medium",
            "prompt": "What is 2 + 2?",
            "answer_key": "4",
            "explanation": "Add the two numbers.",
            "hint": "Count on from two.",
        },
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 201
    # Authored, written, and never read back: the column grant allows the write
    # and forbids the read, so the response cannot carry it.
    assert "answer_key" not in response.text
    assert "4" in str([call[1] for call in connection.calls])


def test_a_question_response_never_carries_the_answer_key():
    client = build_client(admin_connection())

    response = client.get("/api/v1/teacher-admin/questions", headers=ADVISER_HEADERS)

    assert response.status_code == 200
    for forbidden in ("answer_key", "explanation", "hint"):
        assert forbidden not in response.text


def test_publishing_an_unsupported_question_type_is_refused():
    """true_false, matching and ordering are reserved but not deliverable."""
    client = build_client(admin_connection(**{"returning": QUESTION_ROW}))

    response = client.post(
        "/api/v1/teacher-admin/questions",
        json={
            "competency_id": str(COMPETENCY),
            "question_type": "matching",
            "difficulty": "medium",
            "prompt": "Match the pairs.",
            "answer_key": ["a", "b"],
            "status": "published",
        },
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 422


def test_changing_a_question_to_an_unsupported_published_type_is_refused():
    """The same rule on the change, when the change names both fields."""
    connection = admin_connection(**{"returning": QUESTION_ROW})
    client = build_client(connection)

    response = client.patch(
        f"/api/v1/teacher-admin/questions/{QUESTION}",
        json={"question_type": "ordering", "status": "published"},
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 422
    assert not connection.calls


def test_a_question_type_outside_the_enum_is_refused_before_the_database():
    """A free-text type used to reach Postgres and come back as a 500.

    asyncpg raises an invalid enum input as a `DataError`, which is not an
    integrity violation, so it escaped every handler in `middleware.errors` and
    was answered with the generic server sentence. Naming the vocabulary in the
    schema makes it a 422 that lists the choices instead.
    """
    connection = admin_connection(**{"returning": QUESTION_ROW})
    client = build_client(connection)

    response = client.post(
        "/api/v1/teacher-admin/questions",
        json={
            "competency_id": str(COMPETENCY),
            "question_type": "essay",
            "difficulty": "medium",
            "prompt": "Explain your reasoning.",
            "answer_key": "anything",
        },
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
    assert not [call for call in connection.calls if "insert into app.questions" in call[0]]


def test_a_question_difficulty_outside_the_enum_is_refused_before_the_database():
    connection = admin_connection(**{"returning": QUESTION_ROW})
    client = build_client(connection)

    response = client.post(
        "/api/v1/teacher-admin/questions",
        json={
            "competency_id": str(COMPETENCY),
            "question_type": "number_input",
            "difficulty": "spicy",
            "prompt": "What is 2 + 2?",
            "answer_key": "4",
        },
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 422
    assert not [call for call in connection.calls if "insert into app.questions" in call[0]]


def test_every_reserved_question_type_can_still_be_authored_as_a_draft():
    """The three reserved types are storable; only publishing them is refused."""
    for question_type in ("true_false", "matching", "ordering"):
        connection = admin_connection(**{"returning": QUESTION_ROW})
        client = build_client(connection)

        response = client.post(
            "/api/v1/teacher-admin/questions",
            json={
                "competency_id": str(COMPETENCY),
                "question_type": question_type,
                "difficulty": "easy",
                "prompt": "Reserved for later.",
                "answer_key": "a",
            },
            headers=ADVISER_HEADERS,
        )

        assert response.status_code == 201, question_type


def test_a_published_question_requires_a_published_competency_on_create():
    """`questions_select` hides a published question under a draft competency.

    So publishing into one produces an item no learner can be given, and until
    now nothing said so. Modules have refused this since they were written.
    """
    connection = FakeConnection(results={"for share": None})
    client = build_client(connection)

    response = client.post(
        "/api/v1/teacher-admin/questions",
        json={
            "competency_id": str(COMPETENCY),
            "question_type": "number_input",
            "difficulty": "medium",
            "prompt": "What is 2 + 2?",
            "answer_key": "4",
            "status": "published",
        },
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "question_not_publishable"
    assert not [call for call in connection.calls if "insert into app.questions" in call[0]]


def test_a_published_question_requires_a_published_competency_on_update():
    connection = FakeConnection(
        results={
            "as question_status": {"competency_id": COMPETENCY, "question_status": "draft"},
            "for share": None,
        }
    )
    client = build_client(connection)

    response = client.patch(
        f"/api/v1/teacher-admin/questions/{QUESTION}",
        json={"status": "published"},
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "question_not_publishable"
    assert not [call for call in connection.calls if "update app.questions" in call[0]]


def test_an_already_published_question_is_rechecked_when_it_changes_competency():
    """The stored state decides, not the absence of a `status` in the request."""
    connection = FakeConnection(
        results={
            "as question_status": {"competency_id": COMPETENCY, "question_status": "published"},
            "for share": None,
        }
    )
    client = build_client(connection)

    response = client.patch(
        f"/api/v1/teacher-admin/questions/{QUESTION}",
        json={"competency_id": str(MODULE)},
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "question_not_publishable"


def test_publishing_a_question_under_a_published_competency_succeeds():
    published = {**QUESTION_ROW, "status": "published"}
    connection = FakeConnection(
        results={
            "as question_status": {"competency_id": COMPETENCY, "question_status": "draft"},
            "for share": COMPETENCY_ROW,
            "returning": published,
        }
    )
    client = build_client(connection)

    response = client.patch(
        f"/api/v1/teacher-admin/questions/{QUESTION}",
        json={"status": "published"},
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 200
    assert response.json()["data"]["status"] == "published"
    assert "answer_key" not in response.text


def test_updating_a_question_that_is_not_there_is_a_404():
    connection = FakeConnection(results={})
    client = build_client(connection)

    response = client.patch(
        f"/api/v1/teacher-admin/questions/{QUESTION}",
        json={"prompt": "Reworded."},
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 404


def test_the_question_bank_filters_before_it_takes_a_page():
    """Every filter travels to the statement, so the count describes the page.

    Sorting a returned page out in the browser is what made the tab counts and
    the range caption describe a different set from the one on screen.
    """
    connection = admin_connection()
    client = build_client(connection)

    response = client.get(
        "/api/v1/teacher-admin/questions",
        params={
            "search": "integers",
            "status": "archived",
            "competency_id": str(COMPETENCY),
            "question_type": "multiple_choice",
            "difficulty": "hard",
            "page": 2,
            "page_size": 10,
        },
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 200
    listing = next(
        call for call in connection.calls if "select questions.question_id" in call[0]
    )
    assert listing[1] == (
        "integers",
        "archived",
        COMPETENCY,
        "multiple_choice",
        "hard",
        10,
        10,
    )

    counting = next(call for call in connection.calls if "count(*) as total" in call[0])
    assert counting[1] == ("integers", "archived", COMPETENCY, "multiple_choice", "hard")


def test_a_question_status_filter_outside_the_enum_is_refused():
    client = build_client(admin_connection())

    response = client.get(
        "/api/v1/teacher-admin/questions",
        params={"status": "retired"},
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 422


def test_the_question_bank_needs_no_filters_at_all():
    connection = admin_connection()
    client = build_client(connection)

    response = client.get("/api/v1/teacher-admin/questions", headers=ADVISER_HEADERS)

    assert response.status_code == 200
    listing = next(
        call for call in connection.calls if "select questions.question_id" in call[0]
    )
    assert listing[1] == (None, None, None, None, None, 50, 0)


# ---------------------------------------------------------------------------
# Assessments
# ---------------------------------------------------------------------------


def test_assessment_question_membership_is_replaced_atomically():
    # The read-back after the replacement returns one assessment, not a page of
    # them, so this connection answers with a single row.
    connection = admin_connection(**{"from app.assessments": ASSESSMENT_ROW})
    client = build_client(connection)

    response = client.put(
        f"/api/v1/teacher-admin/assessments/{ASSESSMENT}/questions",
        json={"question_ids": [str(QUESTION)]},
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 200
    queries = connection.queries()
    assert any("delete from app.assessment_questions" in query for query in queries)
    assert any("insert into app.assessment_questions" in query for query in queries)


def test_an_empty_membership_is_refused_before_it_empties_an_assessment():
    """The whole list is replaced, so an empty one would leave nothing to deliver."""
    client = build_client(admin_connection(**{"from app.assessments": ASSESSMENT_ROW}))

    response = client.put(
        f"/api/v1/teacher-admin/assessments/{ASSESSMENT}/questions",
        json={"question_ids": []},
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 422
    assert "question_ids" in response.json()["error"]["fields"]


def test_a_repeated_question_is_refused_with_validation_feedback():
    """The membership is keyed on the pair, so a repeat would be a database error."""
    connection = admin_connection(**{"from app.assessments": ASSESSMENT_ROW})
    client = build_client(connection)

    response = client.put(
        f"/api/v1/teacher-admin/assessments/{ASSESSMENT}/questions",
        json={"question_ids": [str(QUESTION), str(QUESTION)]},
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 422
    assert "question_ids" in response.json()["error"]["fields"]
    queries = connection.queries()
    assert not any("app.assessment_questions" in query for query in queries)


def test_publishing_an_empty_assessment_is_refused():
    """Verify publishing an assessment with 0 questions is refused with 422."""
    connection = admin_connection(
        **{READINESS: {**READINESS_ROW, "question_total": 0}, "returning": ASSESSMENT_ROW}
    )
    client = build_client(connection)

    response = client.post(
        f"/api/v1/teacher-admin/assessments/{ASSESSMENT}/publish", headers=ADVISER_HEADERS
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "assessment_not_publishable"
    assert not any("set status" in query for query in connection.queries())


def test_publishing_an_assessment_holding_a_draft_question_is_refused():
    """A draft question would reach the learner as an unanswerable item."""
    connection = admin_connection(
        **{READINESS: {**READINESS_ROW, "unpublished_total": 2}, "returning": ASSESSMENT_ROW}
    )
    client = build_client(connection)

    response = client.post(
        f"/api/v1/teacher-admin/assessments/{ASSESSMENT}/publish", headers=ADVISER_HEADERS
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "assessment_not_publishable"
    assert not any("set status" in query for query in connection.queries())


def test_publishing_an_assessment_for_an_inactive_grade_is_refused():
    """Verify publishing an assessment targeting an inactive grade level is refused with 422."""
    connection = admin_connection(
        **{READINESS: {**READINESS_ROW, "grade_is_active": False}, "returning": ASSESSMENT_ROW}
    )
    client = build_client(connection)

    response = client.post(
        f"/api/v1/teacher-admin/assessments/{ASSESSMENT}/publish", headers=ADVISER_HEADERS
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "assessment_not_publishable"
    assert not any("set status" in query for query in connection.queries())


def test_publishing_a_non_draft_assessment_is_refused():
    """Only draft assessments can be published; archived or published ones cannot."""
    connection = admin_connection(
        **{
            READINESS: {**READINESS_ROW, "assessment_status": "archived"},
            "returning": ASSESSMENT_ROW,
        }
    )
    client = build_client(connection)

    response = client.post(
        f"/api/v1/teacher-admin/assessments/{ASSESSMENT}/publish", headers=ADVISER_HEADERS
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "assessment_not_publishable"
    assert "draft" in response.json()["error"]["message"]
    assert not any("set status" in query for query in connection.queries())


def test_publishing_an_absent_assessment_reports_not_found():
    """Verify attempting to publish a non-existent assessment returns 404."""
    client = build_client(admin_connection(**{READINESS: None}))

    response = client.post(
        f"/api/v1/teacher-admin/assessments/{ASSESSMENT}/publish", headers=ADVISER_HEADERS
    )

    assert response.status_code == 404


def test_publishing_a_populated_assessment_succeeds():
    """Verify publishing an assessment with valid questions marks status as published."""
    client = build_client(
        admin_connection(
            **{
                READINESS: {**READINESS_ROW, "question_total": 4},
                "returning": {**ASSESSMENT_ROW, "status": "published"},
            }
        )
    )

    response = client.post(
        f"/api/v1/teacher-admin/assessments/{ASSESSMENT}/publish", headers=ADVISER_HEADERS
    )

    assert response.status_code == 200
    body = response.json()["data"]
    assert body["status"] == "published"
    assert body["question_count"] == 4


def test_reading_one_assessment_carries_its_membership_in_order():
    """Replacement is whole-list, so the editor has to be able to read the order."""
    second = UUID("f1a4a9f2-63a3-4a47-9e0b-6a6d1f1f3a55")
    client = build_client(
        admin_connection(
            **{
                "from app.assessments": ASSESSMENT_ROW,
                MEMBERSHIP_IDS: [{"question_id": QUESTION}, {"question_id": second}],
            }
        )
    )

    response = client.get(
        f"/api/v1/teacher-admin/assessments/{ASSESSMENT}", headers=ADVISER_HEADERS
    )

    assert response.status_code == 200
    body = response.json()["data"]
    assert body["question_ids"] == [str(QUESTION), str(second)]
    assert body["question_count"] == 2


def test_an_assessment_listing_carries_how_many_questions_each_holds():
    """Verify assessment listing payload includes question_count computed from membership."""
    client = build_client(
        admin_connection(
            **{MEMBERSHIP_COUNTS: [{"assessment_id": ASSESSMENT, "question_total": 3}]}
        )
    )

    response = client.get("/api/v1/teacher-admin/assessments", headers=ADVISER_HEADERS)

    assert response.status_code == 200
    assert response.json()["data"][0]["question_count"] == 3


def test_an_assessment_row_without_membership_reports_no_questions():
    """Verify assessments without question membership default to question_count of 0."""
    client = build_client(admin_connection())

    response = client.get("/api/v1/teacher-admin/assessments", headers=ADVISER_HEADERS)

    assert response.status_code == 200
    assert response.json()["data"][0]["question_count"] == 0


def test_an_assessment_listing_can_be_filtered_by_publication_status():
    """`status` is a documented collection filter, so the tabs are server-truthful.

    Filtering a page in the browser would hide every assessment after it.
    """
    connection = admin_connection()
    client = build_client(connection)

    response = client.get(
        "/api/v1/teacher-admin/assessments?status=published", headers=ADVISER_HEADERS
    )

    assert response.status_code == 200
    listing = next(
        args for query, args in connection.calls if "limit $2 offset $3" in query
    )
    assert listing[3] == "published"


def test_an_assessment_status_filter_outside_the_enum_is_refused():
    """Verify an unsupported status filter query parameter returns validation error 422."""
    client = build_client(admin_connection())

    response = client.get(
        "/api/v1/teacher-admin/assessments?status=retired", headers=ADVISER_HEADERS
    )

    assert response.status_code == 422


def test_an_assessment_type_outside_the_enum_is_refused():
    """diagnostic, reassessment and unit_quiz are the only types the data model has."""
    connection = admin_connection(**{"returning": ASSESSMENT_ROW})
    client = build_client(connection)

    response = client.post(
        "/api/v1/teacher-admin/assessments",
        json={
            "grade_id": str(GRADE),
            "title": "Grade 6 Summative",
            "assessment_type": "summative",
            "duration_minutes": 45,
        },
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 422
    assert "assessment_type" in response.json()["error"]["fields"]
    assert not connection.calls


def test_each_assessment_type_in_the_enum_is_accepted():
    """Verify all valid assessment type enum values are accepted upon creation."""
    for assessment_type in ("diagnostic", "reassessment", "unit_quiz"):
        client = build_client(
            admin_connection(
                **{"returning": {**ASSESSMENT_ROW, "assessment_type": assessment_type}}
            )
        )

        response = client.post(
            "/api/v1/teacher-admin/assessments",
            json={
                "grade_id": str(GRADE),
                "title": f"Grade 6 {assessment_type}",
                "assessment_type": assessment_type,
                "duration_minutes": 45,
            },
            headers=ADVISER_HEADERS,
        )

        assert response.status_code == 201
        assert response.json()["data"]["assessment_type"] == assessment_type


# ---------------------------------------------------------------------------
# Accounts
# ---------------------------------------------------------------------------


def test_an_account_can_be_suspended():
    suspended = {**USER_ROW, "account_status": "suspended"}
    connection = admin_connection(**{"app.set_account_status": suspended})
    client = build_client(connection)

    response = client.patch(
        f"/api/v1/teacher-admin/users/{USER}",
        json={"account_status": "suspended"},
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 200
    assert response.json()["data"]["account_status"] == "suspended"


def test_a_request_cannot_change_a_role():
    """The role is set at provisioning from a trusted claim, never by a request."""
    client = build_client(admin_connection())

    response = client.patch(
        f"/api/v1/teacher-admin/users/{USER}",
        json={"role": "teacher_admin"},
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 422
    assert "role" in response.json()["error"]["fields"]


def test_deleting_a_user_archives_the_profile():
    archived = {**USER_ROW, "account_status": "archived"}
    connection = admin_connection(**{"app.set_account_status": archived})
    client = build_client(connection)

    response = client.delete(f"/api/v1/teacher-admin/users/{USER}", headers=ADVISER_HEADERS)

    assert response.status_code == 200
    assert response.json()["data"]["account_status"] == "archived"
    assert [call for call in connection.calls if "app.set_account_status" in call[0]]


def test_changing_an_account_status_needs_a_live_session():
    client = build_client(admin_connection(), live_session=False)

    response = client.patch(
        f"/api/v1/teacher-admin/users/{USER}",
        json={"account_status": "suspended"},
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 401


# ---------------------------------------------------------------------------
# Settings, audit and the diagnostic reset
# ---------------------------------------------------------------------------


def test_settings_report_the_effective_thresholds():
    client = build_client(admin_connection())

    response = client.get("/api/v1/teacher-admin/settings", headers=ADVISER_HEADERS)

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["thresholds"]["activity_pass_percentage"] == 75
    assert data["intervention"]["unsuccessful_attempts"] == 2


def test_settings_never_carry_a_credential_or_an_editable_model():
    client = build_client(admin_connection())

    response = client.get("/api/v1/teacher-admin/settings", headers=ADVISER_HEADERS)

    body = response.text
    for forbidden in ("api_key", "apikey", "secret", "sb_secret", "GROQ_API_KEY"):
        assert forbidden.lower() not in body.lower()
    assert response.json()["data"]["groq"]["model_is_editable"] is False


def test_a_setting_outside_the_allowed_namespaces_is_refused():
    client = build_client(admin_connection())

    response = client.patch(
        "/api/v1/teacher-admin/settings",
        json={"settings": {"groq.api_key": "sb_secret_value"}},
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 422


def test_a_setting_can_be_updated():
    client = build_client(admin_connection())

    response = client.patch(
        "/api/v1/teacher-admin/settings",
        json={"settings": {"thresholds.activity_pass_percentage": 80}},
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 200


def test_settings_report_sanitized_model_identifier():
    from fastapi.testclient import TestClient

    from app.main import create_app
    from modules.shared.testing import (
        FakeDatabase,
        FakeSessionGateway,
        FakeVerifier,
        fake_settings,
    )


    settings = fake_settings()
    settings.groq_enabled = True
    settings.groq_model = "llama-3.3-70b-versatile"

    app = create_app(
        settings=settings,
        token_verifier=FakeVerifier(),
        database=FakeDatabase(admin_connection()),
        session_gateway=FakeSessionGateway(),
    )
    client = TestClient(app, raise_server_exceptions=False)
    response = client.get("/api/v1/teacher-admin/settings", headers=ADVISER_HEADERS)
    assert response.status_code == 200
    groq_data = response.json()["data"]["groq"]
    assert groq_data["model"] == "llama-3.3-70b-versatile"
    assert groq_data["environment_enabled"] is True
    assert groq_data["model_is_editable"] is False


def test_settings_reject_out_of_bounds_values():
    client = build_client(admin_connection())

    # Below 60%
    r1 = client.patch(
        "/api/v1/teacher-admin/settings",
        json={"settings": {"thresholds.activity_pass_percentage": 50}},
        headers=ADVISER_HEADERS,
    )
    assert r1.status_code == 422

    # Above 90%
    r2 = client.patch(
        "/api/v1/teacher-admin/settings",
        json={"settings": {"thresholds.activity_pass_percentage": 95}},
        headers=ADVISER_HEADERS,
    )
    assert r2.status_code == 422

    # Intervention trigger below 1
    r3 = client.patch(
        "/api/v1/teacher-admin/settings",
        json={"settings": {"intervention.unsuccessful_attempts": 0}},
        headers=ADVISER_HEADERS,
    )
    assert r3.status_code == 422

    # Intervention trigger above 5
    r4 = client.patch(
        "/api/v1/teacher-admin/settings",
        json={"settings": {"intervention.unsuccessful_attempts": 6}},
        headers=ADVISER_HEADERS,
    )
    assert r4.status_code == 422

    # Boolean flags must be bool
    r5 = client.patch(
        "/api/v1/teacher-admin/settings",
        json={"settings": {"features.groq_enabled": "yes"}},
        headers=ADVISER_HEADERS,
    )
    assert r5.status_code == 422

    # Dead notification daily_digest setting is rejected
    r6 = client.patch(
        "/api/v1/teacher-admin/settings",
        json={"settings": {"notifications.daily_digest": True}},
        headers=ADVISER_HEADERS,
    )
    assert r6.status_code == 422
    assert "not allowed" in str(r6.json()["error"]["fields"])


def test_settings_accept_features_groq_advisory():
    client = build_client(admin_connection())

    response = client.patch(
        "/api/v1/teacher-admin/settings",
        json={"settings": {"features.groq_advisory": True}},
        headers=ADVISER_HEADERS,
    )
    assert response.status_code == 200
    assert "features.groq_advisory" in response.json()["data"]["updated"]


def test_settings_update_is_audited():
    connection = admin_connection()
    client = build_client(connection)

    response = client.patch(
        "/api/v1/teacher-admin/settings",
        json={"settings": {"thresholds.activity_pass_percentage": 85}},
        headers=ADVISER_HEADERS,
    )
    assert response.status_code == 200
    audited = [call for call in connection.calls if "app.record_audit_event" in call[0]]
    assert audited
    assert "settings.updated" in audited[0][1]


def test_audit_events_can_be_searched():
    client = build_client(admin_connection())

    response = client.get("/api/v1/teacher-admin/audit-events", headers=ADVISER_HEADERS)

    assert response.status_code == 200
    assert response.json()["data"][0]["action"] == "report.exported"


def test_a_diagnostic_can_be_reset_with_a_reason():
    client = build_client(admin_connection())

    response = client.post(
        f"/api/v1/teacher-admin/students/{STUDENT_ID}/diagnostic-reset",
        json={"reason": "Interrupted by a power cut."},
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 200
    assert response.json()["data"]["status"] == "voided"


def test_a_diagnostic_reset_needs_a_reason():
    client = build_client(admin_connection())

    response = client.post(
        f"/api/v1/teacher-admin/students/{STUDENT_ID}/diagnostic-reset",
        json={},
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 422


def test_a_diagnostic_reset_needs_a_live_session():
    client = build_client(admin_connection(), live_session=False)

    response = client.post(
        f"/api/v1/teacher-admin/students/{STUDENT_ID}/diagnostic-reset",
        json={"reason": "Interrupted by a power cut."},
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 401


# ---------------------------------------------------------------------------
# Grade 6 is the product's scope, and the API is where that is enforced
# ---------------------------------------------------------------------------

#: The read of one grade, which is the specific statement over grade_levels.
GRADE_READ = "where grade_levels.grade_id = $1"

MVP_GRADE_ROW = {"grade_id": GRADE, "name": "Grade 6", "level": 6, "is_active": True}
LEGACY_GRADE = UUID("3f0f0000-0000-4000-8000-000000000003")
LEGACY_GRADE_ROW = {"grade_id": LEGACY_GRADE, "name": "Grade 3", "level": 3, "is_active": True}
SECTION_ROW = {
    "section_id": SECTION,
    "grade_id": GRADE,
    "adviser_id": None,
    "name": "Rizal",
    "is_active": True,
    "created_at": None,
}


def grade_connection(grade=None, **overrides):
    """An admin connection whose single-grade read answers with `grade`."""
    return admin_connection(**{GRADE_READ: grade or MVP_GRADE_ROW, **overrides})


def test_a_teacher_admin_cannot_add_another_grade_level():
    """The grade level is the product's scope, not a teacher's choice."""
    connection = grade_connection()
    client = build_client(connection)

    response = client.post(
        "/api/v1/teacher-admin/grades",
        json={"name": "Grade 3", "level": 3, "is_active": True},
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "grade_scope"
    assert not any("insert into app.grade_levels" in query for query in connection.queries())


def test_even_a_second_grade_six_record_is_refused():
    """The refusal is on creating a grade at all, not on the level requested."""
    connection = grade_connection()
    client = build_client(connection)

    response = client.post(
        "/api/v1/teacher-admin/grades",
        json={"name": "Grade 6", "level": 6, "is_active": True},
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 422
    assert not any("insert into app.grade_levels" in query for query in connection.queries())


def test_a_grade_cannot_be_moved_off_the_supported_level():
    connection = grade_connection()
    client = build_client(connection)

    response = client.patch(
        f"/api/v1/teacher-admin/grades/{GRADE}",
        json={"level": 3},
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "grade_scope"
    assert not any("update app.grade_levels" in query for query in connection.queries())


def test_a_grade_name_cannot_contradict_its_level():
    """The defect this guards: a row reading Grade 3 while stored as level 6."""
    connection = grade_connection(**{"returning": MVP_GRADE_ROW})
    client = build_client(connection)

    response = client.patch(
        f"/api/v1/teacher-admin/grades/{GRADE}",
        json={"name": "Grade 3"},
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "grade_scope"
    assert not any("update app.grade_levels" in query for query in connection.queries())


def test_a_grade_can_still_be_renamed_within_its_own_level():
    connection = grade_connection(**{"returning": MVP_GRADE_ROW})
    client = build_client(connection)

    response = client.patch(
        f"/api/v1/teacher-admin/grades/{GRADE}",
        json={"name": "Grade 6 Mathematics"},
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 200
    assert any("update app.grade_levels" in query for query in connection.queries())


def test_a_legacy_grade_can_be_brought_back_into_scope():
    """Setting a legacy record to the MVP level is the one level change allowed."""
    connection = grade_connection(LEGACY_GRADE_ROW, **{"returning": MVP_GRADE_ROW})
    client = build_client(connection)

    response = client.patch(
        f"/api/v1/teacher-admin/grades/{LEGACY_GRADE}",
        json={"name": "Grade 6", "level": 6},
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 200


def test_the_supported_grade_cannot_be_deactivated():
    """Retiring Grade 6 would empty the curriculum, not tidy the directory."""
    connection = grade_connection()
    client = build_client(connection)

    response = client.delete(f"/api/v1/teacher-admin/grades/{GRADE}", headers=ADVISER_HEADERS)

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "grade_scope"
    assert not any("set is_active = false" in query for query in connection.queries())


def test_a_grade_outside_the_scope_can_be_retired():
    """The cleanup path for a record that should never have existed."""
    connection = grade_connection(LEGACY_GRADE_ROW, **{"returning": LEGACY_GRADE_ROW})
    client = build_client(connection)

    response = client.delete(
        f"/api/v1/teacher-admin/grades/{LEGACY_GRADE}", headers=ADVISER_HEADERS
    )

    assert response.status_code == 204


#: The statement that resolves the one grade a section may belong to.
MVP_GRADE_READ = "order by grade_levels.is_active desc"


def test_a_client_cannot_name_a_grade_when_creating_a_section():
    """The request has no field for it, so a crafted one is refused."""
    connection = grade_connection(**{MVP_GRADE_READ: GRADE, "returning": SECTION_ROW})
    client = build_client(connection)

    response = client.post(
        "/api/v1/teacher-admin/sections",
        json={"grade_id": str(LEGACY_GRADE), "name": "Rizal", "is_active": True},
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 422
    assert not any("insert into app.sections" in query for query in connection.queries())


def test_a_section_cannot_be_moved_to_another_grade():
    """There is one grade, so there is nowhere to move a section to."""
    connection = grade_connection(**{"returning": SECTION_ROW})
    client = build_client(connection)

    response = client.patch(
        f"/api/v1/teacher-admin/sections/{SECTION}",
        json={"grade_id": str(LEGACY_GRADE)},
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 422
    assert not any("update app.sections" in query for query in connection.queries())


def test_the_server_fills_in_the_grade_a_section_belongs_to():
    connection = grade_connection(**{MVP_GRADE_READ: GRADE, "returning": SECTION_ROW})
    client = build_client(connection)

    response = client.post(
        "/api/v1/teacher-admin/sections",
        json={"name": "Rizal", "is_active": True},
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 201
    inserts = [
        (query, args)
        for query, args in connection.calls
        if "insert into app.sections" in query
    ]
    assert inserts, "the section was never inserted"
    assert GRADE in inserts[0][1], "the resolved grade never reached the insert"


def test_the_grade_is_resolved_by_level_not_taken_from_the_request():
    connection = grade_connection(**{MVP_GRADE_READ: GRADE, "returning": SECTION_ROW})
    client = build_client(connection)

    client.post(
        "/api/v1/teacher-admin/sections",
        json={"name": "Rizal", "is_active": True},
        headers=ADVISER_HEADERS,
    )

    lookups = [
        (query, args) for query, args in connection.calls if MVP_GRADE_READ in query
    ]
    assert lookups, "the grade was never resolved"
    assert lookups[0][1] == (6,)


def test_a_missing_grade_six_record_refuses_rather_than_creating_one():
    """The configuration error the scope rule exists to make safe."""
    connection = grade_connection(**{MVP_GRADE_READ: None, "returning": SECTION_ROW})
    client = build_client(connection)

    response = client.post(
        "/api/v1/teacher-admin/sections",
        json={"name": "Rizal", "is_active": True},
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "mvp_grade_missing"
    assert not any("insert into app.grade_levels" in query for query in connection.queries())
    assert not any("insert into app.sections" in query for query in connection.queries())


def test_renaming_a_section_reads_neither_the_grade_nor_the_adviser():
    """A rename is not a scope decision and not an adviser decision."""
    connection = grade_connection(**{"returning": SECTION_ROW})
    client = build_client(connection)

    response = client.patch(
        f"/api/v1/teacher-admin/sections/{SECTION}",
        json={"name": "Bonifacio"},
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 200
    assert not any(GRADE_READ in query for query in connection.queries())


def test_a_grade_scope_refusal_still_needs_a_live_session():
    """The scope rule is not a way around the session requirement."""
    client = build_client(grade_connection(), live_session=False)

    response = client.post(
        "/api/v1/teacher-admin/grades",
        json={"name": "Grade 3", "level": 3, "is_active": True},
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 401


def test_a_learner_cannot_reach_the_grade_directory():
    client = build_client(grade_connection())

    response = client.post(
        "/api/v1/teacher-admin/grades",
        json={"name": "Grade 6", "level": 6, "is_active": True},
        headers=LEARNER_HEADERS,
    )

    assert response.status_code == 403


# ---------------------------------------------------------------------------
# A section's adviser is a teacher_admin profile, not an account
# ---------------------------------------------------------------------------
#
# `sections.adviser_id` references `teacher_admin_profiles.teacher_admin_id`,
# which is that profile's own key. The account's `user_id` is a different
# value. Sending the account id reached the database and came back as a
# foreign key violation — an unhandled 500, answered above the CORS middleware,
# which a browser can only report as "Failed to fetch".

#: The statement that decides whether an id may advise a section.
ADVISER_READ = "from app.teacher_admin_profiles"

ADVISER_ID = UUID("7c1f0000-0000-4000-8000-0000000000a1")
ADVISER_ACCOUNT_ID = UUID("a0000000-0000-4000-8000-0000000000a1")


def section_connection(*, adviser=None, **overrides):
    """An admin connection whose adviser lookup answers with `adviser`."""
    return grade_connection(
        **{
            MVP_GRADE_READ: GRADE,
            ADVISER_READ: adviser,
            "returning": {**SECTION_ROW, "adviser_id": adviser},
            **overrides,
        }
    )


def test_a_section_is_created_without_an_adviser():
    """Case 1: no adviser assigned."""
    connection = section_connection()
    client = build_client(connection)

    response = client.post(
        "/api/v1/teacher-admin/sections",
        json={"name": "Rizal", "is_active": True},
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 201
    # With no adviser to check, the adviser statement is never run.
    assert not any(ADVISER_READ in query for query in connection.queries())


def test_a_section_is_created_with_a_valid_adviser():
    """Case 2: a real, active Teacher/Administrator profile."""
    connection = section_connection(adviser=ADVISER_ID)
    client = build_client(connection)

    response = client.post(
        "/api/v1/teacher-admin/sections",
        json={
            "name": "Rizal",
            "adviser_id": str(ADVISER_ID),
            "is_active": True,
        },
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 201
    assert any("insert into app.sections" in query for query in connection.queries())


def test_an_adviser_can_be_assigned_to_an_existing_section():
    """Case 3: assigning an adviser to a section that had none."""
    connection = section_connection(adviser=ADVISER_ID)
    client = build_client(connection)

    response = client.patch(
        f"/api/v1/teacher-admin/sections/{SECTION}",
        json={"adviser_id": str(ADVISER_ID)},
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 200


def test_the_assigned_adviser_can_be_changed():
    """Case 4: swapping one adviser for another."""
    other = UUID("7c1f0000-0000-4000-8000-0000000000a2")
    connection = section_connection(adviser=other)
    client = build_client(connection)

    response = client.patch(
        f"/api/v1/teacher-admin/sections/{SECTION}",
        json={"adviser_id": str(other)},
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 200


def test_the_adviser_can_be_cleared():
    """Case 5: an explicit null clears the assignment and checks nothing."""
    connection = section_connection()
    client = build_client(connection)

    response = client.patch(
        f"/api/v1/teacher-admin/sections/{SECTION}",
        json={"adviser_id": None},
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 200
    assert not any(ADVISER_READ in query for query in connection.queries())


def test_an_unknown_adviser_is_refused_before_it_reaches_the_table():
    """Case 6: the defect. An account id is not a teacher_admin_id."""
    connection = section_connection(adviser=None)
    client = build_client(connection)

    response = client.post(
        "/api/v1/teacher-admin/sections",
        json={
            "name": "Rizal",
            "adviser_id": str(ADVISER_ACCOUNT_ID),
            "is_active": True,
        },
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "adviser_unknown"
    assert "adviser_id" in response.json()["error"]["fields"]
    # Refused before the insert, so the constraint is never reached.
    assert not any("insert into app.sections" in query for query in connection.queries())


def test_an_inactive_adviser_is_refused():
    """An account that has been deactivated can no longer take a section."""
    connection = section_connection(adviser=None)
    client = build_client(connection)

    response = client.patch(
        f"/api/v1/teacher-admin/sections/{SECTION}",
        json={"adviser_id": str(ADVISER_ID)},
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "adviser_unknown"
    assert not any("update app.sections" in query for query in connection.queries())


def test_the_adviser_check_reads_the_profile_table_not_the_account_table():
    """The check has to be against the table the foreign key points at."""
    connection = section_connection(adviser=ADVISER_ID)
    client = build_client(connection)

    client.post(
        "/api/v1/teacher-admin/sections",
        json={
            "name": "Rizal",
            "adviser_id": str(ADVISER_ID),
            "is_active": True,
        },
        headers=ADVISER_HEADERS,
    )

    checks = [query for query in connection.queries() if ADVISER_READ in query]
    assert checks, "the adviser was never checked"
    assert "teacher_admin_profiles.teacher_admin_id = $1" in checks[0]
    assert "account_status = 'active'" in checks[0]


def test_the_account_listing_carries_the_id_a_section_points_at():
    """The frontend can only send the right id if the API supplies it."""
    connection = admin_connection(
        **{
            "from app.user_profiles": [{**USER_ROW, "teacher_admin_id": ADVISER_ID}],
            TOTAL: 1,
        }
    )
    client = build_client(connection)

    response = client.get(
        "/api/v1/teacher-admin/users?role=teacher_admin", headers=ADVISER_HEADERS
    )

    assert response.status_code == 200
    row = response.json()["data"][0]
    assert row["teacher_admin_id"] == str(ADVISER_ID)
    # The two ids are reported separately, so neither can be mistaken for the
    # other by a caller reading the envelope.
    assert row["user_id"] != row["teacher_admin_id"]


def test_a_learner_has_no_adviser_id_to_be_assigned_by():
    connection = admin_connection(
        **{"from app.user_profiles": [{**USER_ROW, "teacher_admin_id": None}], TOTAL: 1}
    )
    client = build_client(connection)

    response = client.get("/api/v1/teacher-admin/users", headers=ADVISER_HEADERS)

    assert response.json()["data"][0]["teacher_admin_id"] is None


def test_a_constraint_violation_is_a_refusal_not_a_crash():
    """The last line of defence, and the reason the browser saw nothing.

    An unhandled exception is answered by Starlette's outermost error
    middleware, which sits above the CORS middleware, so that reply carries no
    `Access-Control-Allow-Origin` and the browser reports only "Failed to
    fetch". A handled one stays inside CORS and can be read and shown.
    """
    import asyncpg

    class ExplodingConnection(FakeConnection):
        async def fetchrow(self, query: str, *args):
            if "insert into app.sections" in query:
                raise asyncpg.exceptions.ForeignKeyViolationError(
                    'insert or update on table "sections" violates foreign key '
                    'constraint "sections_adviser_id_fkey"'
                )
            return await super().fetchrow(query, *args)

    connection = ExplodingConnection(
        results={
            MVP_GRADE_READ: GRADE,
            GRADE_READ: MVP_GRADE_ROW,
            ADVISER_READ: ADVISER_ID,
            "returning": SECTION_ROW,
        }
    )
    client = build_client(connection)

    response = client.post(
        "/api/v1/teacher-admin/sections",
        json={
            "name": "Rizal",
            "adviser_id": str(ADVISER_ID),
            "is_active": True,
        },
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "constraint_violation"
    # The constraint name, the table and the column stay in the log.
    assert "sections_adviser_id_fkey" not in response.text


def test_a_refused_request_still_carries_the_cors_header_a_browser_needs():
    """Without this header the page cannot read the refusal at all."""
    connection = section_connection(adviser=None)
    client = build_client(connection)

    response = client.post(
        "/api/v1/teacher-admin/sections",
        json={
            "name": "Rizal",
            "adviser_id": str(ADVISER_ACCOUNT_ID),
            "is_active": True,
        },
        headers={**ADVISER_HEADERS, "Origin": "http://localhost:3000"},
    )

    assert response.status_code == 422
    assert response.headers.get("access-control-allow-origin") == "http://localhost:3000"


# ---------------------------------------------------------------------------
# Deleting a retired section, which is the one thing here that cannot be undone
# ---------------------------------------------------------------------------

#: The statement that reads one section, used to decide whether it is retired.
SECTION_READ = "where sections.section_id = $1"
#: The statement that counts the learners still pointing at a section.
LEARNER_COUNT = "from app.student_profiles"
#: The removal itself.
SECTION_DELETE = "delete from app.sections"

RETIRED_SECTION = {**SECTION_ROW, "is_active": False}


def delete_connection(*, section=None, learners=0, **overrides):
    """A connection whose section read, learner count and delete are chosen.

    Built directly rather than through `admin_connection`, because the shared
    fixture answers anything containing `count(*) as total` with 1 and the
    learner count is such a statement. The fragments below are ordered so the
    specific ones win.
    """
    results = {
        LEARNER_COUNT: learners,
        SECTION_DELETE: SECTION,
        SECTION_READ: RETIRED_SECTION if section is None else section,
        "set is_active = false": SECTION,
        TOTAL: 1,
    }
    results.update(overrides)
    return FakeConnection(results=results)


def test_a_retired_section_with_no_learners_is_deleted():
    connection = delete_connection()
    client = build_client(connection)

    response = client.delete(
        f"/api/v1/teacher-admin/sections/{SECTION}/record", headers=ADVISER_HEADERS
    )

    assert response.status_code == 204
    assert any(SECTION_DELETE in query for query in connection.queries())


def test_a_live_section_cannot_be_deleted_in_one_step():
    """Retiring is a separate, reversible decision that has to come first."""
    connection = delete_connection(section=SECTION_ROW)
    client = build_client(connection)

    response = client.delete(
        f"/api/v1/teacher-admin/sections/{SECTION}/record", headers=ADVISER_HEADERS
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "section_active"
    assert not any(SECTION_DELETE in query for query in connection.queries())


def test_a_section_a_learner_still_belongs_to_cannot_be_deleted():
    connection = delete_connection(learners=3)
    client = build_client(connection)

    response = client.delete(
        f"/api/v1/teacher-admin/sections/{SECTION}/record", headers=ADVISER_HEADERS
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "section_in_use"
    # The refusal says how many, so the teacher knows what to move.
    assert "3 learners" in response.json()["error"]["message"]
    assert not any(SECTION_DELETE in query for query in connection.queries())


def test_the_refusal_counts_a_single_learner_correctly():
    connection = delete_connection(learners=1)
    client = build_client(connection)

    response = client.delete(
        f"/api/v1/teacher-admin/sections/{SECTION}/record", headers=ADVISER_HEADERS
    )

    assert response.status_code == 422
    assert "1 learner still belongs" in response.json()["error"]["message"]


def test_deleting_a_section_that_is_not_there_is_a_404():
    connection = delete_connection(**{SECTION_READ: None})
    client = build_client(connection)

    response = client.delete(
        f"/api/v1/teacher-admin/sections/{SECTION}/record", headers=ADVISER_HEADERS
    )

    assert response.status_code == 404
    assert not any(SECTION_DELETE in query for query in connection.queries())


def test_deleting_a_section_needs_a_live_session():
    """The same sensitive-action gate every other write here carries."""
    client = build_client(delete_connection(), live_session=False)

    response = client.delete(
        f"/api/v1/teacher-admin/sections/{SECTION}/record", headers=ADVISER_HEADERS
    )

    assert response.status_code == 401


def test_a_learner_cannot_delete_a_section():
    connection = delete_connection()
    client = build_client(connection)

    response = client.delete(
        f"/api/v1/teacher-admin/sections/{SECTION}/record", headers=LEARNER_HEADERS
    )

    assert response.status_code == 403
    assert not any(SECTION_DELETE in query for query in connection.queries())


def test_the_archiving_route_still_only_archives():
    """The documented DELETE keeps its documented meaning."""
    connection = delete_connection()
    client = build_client(connection)

    response = client.delete(f"/api/v1/teacher-admin/sections/{SECTION}", headers=ADVISER_HEADERS)

    assert response.status_code == 204
    assert not any(SECTION_DELETE in query for query in connection.queries())
    assert any("set is_active = false" in query for query in connection.queries())


def test_the_learner_check_runs_before_the_delete():
    """Order matters: the count is what lets the refusal be specific."""
    connection = delete_connection()
    client = build_client(connection)

    client.delete(f"/api/v1/teacher-admin/sections/{SECTION}/record", headers=ADVISER_HEADERS)

    queries = connection.queries()
    counted = next(i for i, query in enumerate(queries) if LEARNER_COUNT in query)
    deleted = next(i for i, query in enumerate(queries) if SECTION_DELETE in query)
    assert counted < deleted


def test_an_unexpected_failure_still_reaches_the_browser():
    """The reason two separate defects read as "Failed to fetch".

    An unhandled exception is answered by Starlette's outermost error
    middleware, above CORS, so the reply carried no
    `Access-Control-Allow-Origin` and the page could not read it. The safety
    net answers from inside CORS instead.
    """

    class ExplodingConnection(FakeConnection):
        async def fetchval(self, query: str, *args):
            if "from app.grade_levels" in query:
                raise RuntimeError("something nobody predicted")
            return await super().fetchval(query, *args)

    client = build_client(ExplodingConnection(results={GRADE_READ: MVP_GRADE_ROW}))

    response = client.post(
        "/api/v1/teacher-admin/sections",
        json={"name": "Rizal", "is_active": True},
        headers={**ADVISER_HEADERS, "Origin": "http://localhost:3000"},
    )

    assert response.status_code == 500
    assert response.headers.get("access-control-allow-origin") == "http://localhost:3000"
    # The envelope is intact, and the exception text is not in it.
    assert response.json()["error"]["request_id"]
    assert "something nobody predicted" not in response.text


def test_a_database_privilege_refusal_is_not_a_silent_failure():
    """What a missing grant looks like before the migration lands."""
    import asyncpg

    class UnprivilegedConnection(FakeConnection):
        async def fetchval(self, query: str, *args):
            if "delete from app.sections" in query:
                raise asyncpg.exceptions.InsufficientPrivilegeError(
                    "permission denied for table sections"
                )
            return await super().fetchval(query, *args)

    connection = UnprivilegedConnection(
        results={
            LEARNER_COUNT: 0,
            SECTION_READ: RETIRED_SECTION,
            TOTAL: 1,
        }
    )
    client = build_client(connection)

    response = client.delete(
        f"/api/v1/teacher-admin/sections/{SECTION}/record",
        headers={**ADVISER_HEADERS, "Origin": "http://localhost:3000"},
    )

    # A privilege error is never the caller's mistake: the route has already
    # checked the role, so it means this database is missing a grant the code
    # expects. 503 and a sentence somebody can act on, rather than a 500 that
    # reads as "the server fell over".
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "not_configured"
    # Still inside CORS, or a browser can only report "Failed to fetch".
    assert response.headers.get("access-control-allow-origin") == "http://localhost:3000"
    # The driver's hint names the exact GRANT, and never reaches the client.
    assert "permission denied" not in response.text
    assert "GRANT" not in response.text


# ---------------------------------------------------------------------------
# A competency belongs to the one grade MathSmart teaches
# ---------------------------------------------------------------------------
#
# The form offers no grade and the request may not name one. The interface is
# not the boundary: these prove a crafted request cannot put a competency in a
# grade that has no learners, modules or assessments behind it.

COMPETENCY_INSERT = "insert into app.competencies"
COMPETENCY_UPDATE = "update app.competencies"
COMPETENCY_DELETE = "delete from app.competencies"
COMPETENCY_REFERENCES = "as delivered_questions"
COMPETENCY_STATE = "select competencies.competency_id, competencies.code, competencies.status"

NEW_COMPETENCY = {
    "code": "MATH6-INT-09",
    "name": "Multiplication and Division of Integers",
    "domain": "Numbers and Number Sense",
}


def test_a_competency_is_created_in_grade_six_without_being_asked():
    connection = admin_connection()
    client = build_client(connection)

    response = client.post(
        "/api/v1/teacher-admin/competencies", json=NEW_COMPETENCY, headers=ADVISER_HEADERS
    )

    assert response.status_code == 201
    insert = next(call for call in connection.calls if COMPETENCY_INSERT in call[0])
    assert GRADE in insert[1], "the server did not pin the grade itself"


def test_a_competency_request_cannot_name_its_own_grade():
    """The refusal a crafted request meets, not a field the form forgot."""
    client = build_client(admin_connection())

    response = client.post(
        "/api/v1/teacher-admin/competencies",
        json={**NEW_COMPETENCY, "grade_id": str(LEGACY_GRADE)},
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 422


def test_a_competency_cannot_be_moved_to_another_grade():
    client = build_client(admin_connection())

    response = client.patch(
        f"/api/v1/teacher-admin/competencies/{COMPETENCY}",
        json={"grade_id": str(LEGACY_GRADE)},
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 422


def test_a_missing_grade_six_record_refuses_rather_than_inventing_one():
    connection = admin_connection(**{MVP_GRADE: None})
    client = build_client(connection)

    response = client.post(
        "/api/v1/teacher-admin/competencies", json=NEW_COMPETENCY, headers=ADVISER_HEADERS
    )

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "mvp_grade_missing"
    assert not any(COMPETENCY_INSERT in query for query in connection.queries())


# ---------------------------------------------------------------------------
# A code is normalised, not merely checked
# ---------------------------------------------------------------------------


def test_a_lowercase_code_is_saved_as_the_code_it_means():
    """The column stores `upper(btrim(code))`, so this is the same code."""
    connection = admin_connection()
    client = build_client(connection)

    response = client.post(
        "/api/v1/teacher-admin/competencies",
        json={**NEW_COMPETENCY, "code": "  math6-int-09 "},
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 201
    insert = next(call for call in connection.calls if COMPETENCY_INSERT in call[0])
    assert "MATH6-INT-09" in insert[1]
    assert "  math6-int-09 " not in insert[1]


def test_a_code_that_cannot_be_stored_is_refused_with_a_reason():
    client = build_client(admin_connection())

    for bad in ("MATH 6", "MATH6!", "-LEADING", "AB"):
        response = client.post(
            "/api/v1/teacher-admin/competencies",
            json={**NEW_COMPETENCY, "code": bad},
            headers=ADVISER_HEADERS,
        )
        assert response.status_code == 422, bad


def test_a_name_of_only_spaces_is_refused_before_the_database_sees_it():
    client = build_client(admin_connection())

    response = client.post(
        "/api/v1/teacher-admin/competencies",
        json={**NEW_COMPETENCY, "name": "     "},
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 422


# ---------------------------------------------------------------------------
# Publishing, unpublishing and restoring are one call
# ---------------------------------------------------------------------------


def test_a_draft_can_be_published():
    connection = admin_connection()
    client = build_client(connection)

    response = client.patch(
        f"/api/v1/teacher-admin/competencies/{COMPETENCY}",
        json={"status": "published"},
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 200
    update = next(call for call in connection.calls if COMPETENCY_UPDATE in call[0])
    assert "published" in update[1]


def test_a_published_competency_can_be_unpublished():
    connection = admin_connection()
    client = build_client(connection)

    response = client.patch(
        f"/api/v1/teacher-admin/competencies/{COMPETENCY}",
        json={"status": "draft"},
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 200
    update = next(call for call in connection.calls if COMPETENCY_UPDATE in call[0])
    assert "draft" in update[1]


def test_an_archived_competency_can_be_restored():
    """Archiving is reversible; nothing else in this module would say so."""
    connection = admin_connection()
    client = build_client(connection)

    response = client.patch(
        f"/api/v1/teacher-admin/competencies/{COMPETENCY}",
        json={"status": "published"},
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 200
    assert not any(COMPETENCY_DELETE in query for query in connection.queries())


def test_changing_a_publication_state_needs_a_live_session():
    client = build_client(admin_connection(), live_session=False)

    response = client.patch(
        f"/api/v1/teacher-admin/competencies/{COMPETENCY}",
        json={"status": "published"},
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 401


# ---------------------------------------------------------------------------
# What still points at a competency
# ---------------------------------------------------------------------------

NO_REFERENCES = {
    "questions": 0,
    "learning_modules": 0,
    "competency_progress": 0,
    "competency_results": 0,
    "learning_path_items": 0,
    "interventions": 0,
    "delivered_questions": 0,
}

ARCHIVED_STATE = {"competency_id": COMPETENCY, "code": "MATH6-INT-09", "status": "archived"}


def competency_delete_connection(state=None, references=None, **overrides):
    """A connection that answers only the statements the delete path makes.

    Built directly rather than through `admin_connection`, because the fake
    matches the first fragment it finds and the shared fixture answers
    `from app.competencies` with a list — which is the right answer for the
    listing and the wrong one for a single row.
    """
    results = {
        COMPETENCY_STATE: dict(ARCHIVED_STATE) if state is None else state,
        COMPETENCY_REFERENCES: dict(NO_REFERENCES) if references is None else references,
        COMPETENCY_DELETE: {"competency_id": COMPETENCY},
        # The archive path, so the `DELETE` verb still has something to return.
        "set status = 'archived'": {"competency_id": COMPETENCY},
    }
    results.update(overrides)
    return FakeConnection(results=results)


def test_the_references_read_counts_every_table_that_could_hold_one():
    connection = competency_delete_connection(references={**NO_REFERENCES, "questions": 3})
    client = build_client(connection)

    response = client.get(
        f"/api/v1/teacher-admin/competencies/{COMPETENCY}/references", headers=ADVISER_HEADERS
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["references"]["questions"] == 3
    assert data["total"] == 3
    # Every table in the plan is answered for, so a caller can say what goes
    # dark rather than guessing.
    assert set(data["references"]) == set(NO_REFERENCES)


def test_a_learner_cannot_read_what_references_a_competency():
    client = build_client(competency_delete_connection())

    response = client.get(
        f"/api/v1/teacher-admin/competencies/{COMPETENCY}/references", headers=LEARNER_HEADERS
    )

    assert response.status_code == 403


# ---------------------------------------------------------------------------
# Deleting a competency that was never used
# ---------------------------------------------------------------------------


def delete_it(client, headers=None):
    return client.post(
        f"/api/v1/teacher-admin/competencies/{COMPETENCY}/delete",
        headers=headers or ADVISER_HEADERS,
    )


def test_an_unused_archived_competency_can_be_deleted():
    connection = competency_delete_connection()
    client = build_client(connection)

    assert delete_it(client).status_code == 204
    assert any(COMPETENCY_DELETE in query for query in connection.queries())


def test_a_competency_that_is_not_archived_cannot_be_deleted():
    """Archive first, so removal is always a second, separate decision."""
    connection = competency_delete_connection(state={**ARCHIVED_STATE, "status": "published"})
    client = build_client(connection)

    response = delete_it(client)

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "competency_not_archived"
    assert not any(COMPETENCY_DELETE in query for query in connection.queries())


def test_a_draft_cannot_be_deleted_either():
    connection = competency_delete_connection(state={**ARCHIVED_STATE, "status": "draft"})
    client = build_client(connection)

    assert delete_it(client).status_code == 422
    assert not any(COMPETENCY_DELETE in query for query in connection.queries())


def test_a_referenced_competency_is_refused_and_told_why():
    connection = competency_delete_connection(
        references={**NO_REFERENCES, "questions": 3, "learning_modules": 1}
    )
    client = build_client(connection)

    response = delete_it(client)

    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "competency_in_use"
    # The refusal names what is in the way, not just that something is.
    assert "3 questions" in error["message"]
    assert "1 learning module" in error["message"]
    assert not any(COMPETENCY_DELETE in query for query in connection.queries())


def test_a_competency_holding_learner_evidence_is_refused():
    """The case that matters: a child's recorded work is behind this."""
    connection = competency_delete_connection(
        references={**NO_REFERENCES, "competency_progress": 1, "competency_results": 2}
    )
    client = build_client(connection)

    response = delete_it(client)

    assert response.status_code == 422
    assert "learner progress record" in response.json()["error"]["message"]
    assert not any(COMPETENCY_DELETE in query for query in connection.queries())


def test_deleting_a_competency_needs_a_live_session():
    client = build_client(competency_delete_connection(), live_session=False)

    assert delete_it(client).status_code == 401


def test_a_learner_cannot_delete_a_competency():
    connection = competency_delete_connection()
    client = build_client(connection)

    response = delete_it(client, headers=LEARNER_HEADERS)

    assert response.status_code == 403
    assert not any(COMPETENCY_DELETE in query for query in connection.queries())


def test_deleting_a_competency_that_is_not_there_is_not_found():
    connection = competency_delete_connection(**{COMPETENCY_STATE: None})
    client = build_client(connection)

    assert delete_it(client).status_code == 404


def test_archiving_still_deletes_nothing():
    """The DELETE verb archives, and has since this module was written."""
    connection = competency_delete_connection()
    client = build_client(connection)

    client.delete(
        f"/api/v1/teacher-admin/competencies/{COMPETENCY}", headers=ADVISER_HEADERS
    )

    assert not any(COMPETENCY_DELETE in query for query in connection.queries())
