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


def admin_connection(**overrides):
    results = {
        TOTAL: 1,
        "from app.competencies": [COMPETENCY_ROW],
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
            "grade_id": str(GRADE),
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
            "grade_id": str(GRADE),
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
            "grade_id": str(GRADE),
            "domain": "Number Sense",
        },
        headers=ADVISER_HEADERS,
    )

    assert response.status_code == 422


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


def test_publishing_an_absent_assessment_reports_not_found():
    client = build_client(admin_connection(**{READINESS: None}))

    response = client.post(
        f"/api/v1/teacher-admin/assessments/{ASSESSMENT}/publish", headers=ADVISER_HEADERS
    )

    assert response.status_code == 404


def test_publishing_a_populated_assessment_succeeds():
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
    client = build_client(
        admin_connection(
            **{MEMBERSHIP_COUNTS: [{"assessment_id": ASSESSMENT, "question_total": 3}]}
        )
    )

    response = client.get("/api/v1/teacher-admin/assessments", headers=ADVISER_HEADERS)

    assert response.status_code == 200
    assert response.json()["data"][0]["question_count"] == 3


def test_an_assessment_row_without_membership_reports_no_questions():
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
