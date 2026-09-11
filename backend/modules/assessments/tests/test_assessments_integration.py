"""Assessment grading through the actor-scoped connection.

The pgTAP suite proves the grading rules against the database directly. This
proves the path the API actually takes: the same functions, called through the
backend's own connection, as the `authenticated` role, with the actor context
set from a verified token — and an answer key that still cannot be selected.

Requires a live PostgreSQL with the MathSmart migrations applied. Set
MATHSMART_TEST_DB_URL to run them; they are skipped otherwise.
"""

from __future__ import annotations

import asyncio
import json
import os
from contextlib import suppress
from uuid import UUID, uuid4

import asyncpg
import pytest
from pydantic import SecretStr

from middleware.auth import MathSmartRole, VerifiedToken
from modules.assessments import repository
from modules.shared.actor_context import build_actor_context
from modules.shared.db import Database

DB_URL = os.environ.get("MATHSMART_TEST_DB_URL")

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(not DB_URL, reason="MATHSMART_TEST_DB_URL is not set"),
]

LEARNER = uuid4()
OTHER_LEARNER = uuid4()
EDUCATOR = uuid4()
SUFFIX = uuid4().hex[:8].upper()
EMAIL_SUFFIX = SUFFIX.lower()


def token_for(user_id: UUID) -> VerifiedToken:
    return VerifiedToken(
        user_id=user_id,
        role=MathSmartRole.STUDENT,
        claims={
            "sub": str(user_id),
            "aud": "authenticated",
            "app_metadata": {"role": "student"},
        },
    )


@pytest.fixture
async def seeded() -> dict[str, UUID]:
    """A published diagnostic of two questions over one competency."""
    owner = await asyncpg.connect(DB_URL, statement_cache_size=0)
    email = f"grade.one.{EMAIL_SUFFIX}@mathsmart.test"
    other_email = f"grade.two.{EMAIL_SUFFIX}@mathsmart.test"
    educator_email = f"grade.adviser.{EMAIL_SUFFIX}@mathsmart.test"
    competency_id = module_id = assessment_id = None
    question_ids: list[UUID] = []
    try:
        await owner.execute(
            "insert into auth.users (id, email) values ($1, $2), ($3, $4), ($5, $6)",
            LEARNER, email, OTHER_LEARNER, other_email, EDUCATOR, educator_email,
        )
        await owner.execute(
            """
            insert into app.user_profiles (user_id, full_name, email, role) values
              ($1, 'Grading Learner', $2, 'student'),
              ($3, 'Other Learner', $4, 'student'),
              ($5, 'Grading Adviser', $6, 'teacher_admin')
            """,
            LEARNER, email, OTHER_LEARNER, other_email, EDUCATOR, educator_email,
        )
        teacher_admin_id = await owner.fetchval(
            """
            insert into app.teacher_admin_profiles
              (user_id, employee_id, school_name, division_name)
            values ($1, $2, 'Sample School', 'Sample Division')
            returning teacher_admin_id
            """,
            EDUCATOR, f"EMP-{SUFFIX}",
        )
        await owner.execute(
            """
            insert into app.student_profiles (user_id, learner_id, grade_id) values
              ($1, $2, (select grade_id from app.grade_levels where level = 6)),
              ($3, $4, (select grade_id from app.grade_levels where level = 6))
            """,
            LEARNER, f"LRN-G1-{SUFFIX}", OTHER_LEARNER, f"LRN-G2-{SUFFIX}",
        )
        competency_id = await owner.fetchval(
            """
            insert into app.competencies (code, grade_id, domain, name, status)
            values ($1, (select grade_id from app.grade_levels where level = 6),
                    'Number Sense', 'Grading competency', 'published')
            returning competency_id
            """,
            f"GRDX-{SUFFIX}",
        )
        module_id = await owner.fetchval(
            """
            insert into app.learning_modules
              (competency_id, title, estimated_minutes, learning_objective,
               short_explanation, status, order_index)
            values ($1, $2, 15, 'Objective.', 'Explanation.', 'published', 1)
            returning module_id
            """,
            competency_id, f"Grading module {SUFFIX}",
        )
        for prompt, key in (("What is (-9) x (-8)?", '"72"'), ("What is 12.6 / 3?", "4.2")):
            question_ids.append(
                await owner.fetchval(
                    """
                    insert into app.questions
                      (competency_id, question_type, prompt, choices, answer_key, status)
                    values ($1, 'number_input', $2, '[]'::jsonb, $3::jsonb, 'published')
                    returning question_id
                    """,
                    competency_id, prompt, key,
                )
            )
        assessment_id = await owner.fetchval(
            """
            insert into app.assessments
              (grade_id, title, assessment_type, status, duration_minutes)
            values ((select grade_id from app.grade_levels where level = 6),
                    $1, 'diagnostic', 'published', 30)
            returning assessment_id
            """,
            f"Grading diagnostic {SUFFIX}",
        )
        for position, question_id in enumerate(question_ids, start=1):
            await owner.execute(
                """
                insert into app.assessment_questions (assessment_id, question_id, position)
                values ($1, $2, $3)
                """,
                assessment_id, question_id, position,
            )
        student_id = await owner.fetchval(
            "select student_id from app.student_profiles where user_id = $1", LEARNER
        )
        yield {
            "assessment_id": assessment_id,
            "competency_id": competency_id,
            "module_id": module_id,
            "questions": question_ids,
            "student_id": student_id,
            "teacher_admin_id": teacher_admin_id,
        }
    finally:
        # Reverse dependency order; these foreign keys restrict rather than cascade.
        await owner.execute(
            "delete from app.learning_path_items where competency_id = $1", competency_id
        )
        await owner.execute(
            """
            delete from app.competency_results
            where attempt_id in (
              select attempt_id from app.assessment_attempts where assessment_id = $1
            )
            """,
            assessment_id,
        )
        await owner.execute(
            """
            delete from app.assessment_responses
            where attempt_id in (
              select attempt_id from app.assessment_attempts where assessment_id = $1
            )
            """,
            assessment_id,
        )
        await owner.execute(
            "delete from app.competency_progress where competency_id = $1", competency_id
        )
        await owner.execute(
            "delete from app.reassessment_authorizations where assessment_id = $1",
            assessment_id,
        )
        await owner.execute(
            "delete from app.assessment_attempts where assessment_id = $1", assessment_id
        )
        await owner.execute(
            "delete from app.assessment_questions where assessment_id = $1", assessment_id
        )
        await owner.execute("delete from app.assessments where assessment_id = $1", assessment_id)
        await owner.execute(
            "delete from app.questions where competency_id = $1", competency_id
        )
        await owner.execute("delete from app.learning_modules where module_id = $1", module_id)
        await owner.execute(
            "delete from app.competencies where competency_id = $1", competency_id
        )
        await owner.execute(
            "delete from app.teacher_admin_profiles where user_id = $1", EDUCATOR
        )
        await owner.execute(
            "delete from auth.users where id = any($1::uuid[])",
            [LEARNER, OTHER_LEARNER, EDUCATOR],
        )
        await owner.close()


@pytest.fixture
async def database() -> Database:
    db = Database(SecretStr(DB_URL))
    await db.connect()
    try:
        yield db
    finally:
        await db.disconnect()


async def test_the_api_connection_cannot_select_an_answer_key(database, seeded):
    """The column privilege, not the query, is what keeps the key out of a response."""
    async with database.actor(token_for(LEARNER)) as connection:
        with pytest.raises(asyncpg.InsufficientPrivilegeError):
            await connection.fetch("select answer_key from app.questions")


async def test_delivered_questions_carry_no_answer(database, seeded):
    async with database.actor(token_for(LEARNER)) as connection:
        attempt = await repository.start_attempt(connection, seeded["assessment_id"])
        rows = await repository.questions_for(connection, attempt["attempt_id"])

    assert len(rows) == 2
    for row in rows:
        assert "answer_key" not in row.keys()
        assert "explanation" not in row.keys()
        assert "hint" not in row.keys()


async def test_starting_twice_resumes_the_same_attempt(database, seeded):
    async with database.actor(token_for(LEARNER)) as connection:
        first = await repository.start_attempt(connection, seeded["assessment_id"])
        second = await repository.start_attempt(connection, seeded["assessment_id"])

    assert first["attempt_id"] == second["attempt_id"]
    assert str(first["status"]) == "in_progress"


async def test_attempt_start_serializes_with_cross_grade_membership_edit(seeded):
    starter = await asyncpg.connect(DB_URL, statement_cache_size=0)
    author = await asyncpg.connect(DB_URL, statement_cache_size=0)
    other_grade_id = competency_id = question_id = None
    created_other_grade = False
    starter_transaction = starter.transaction()
    author_transaction = author.transaction()
    author_task = None
    try:
        other_grade_id = await author.fetchval(
            "select grade_id from app.grade_levels where level = 5"
        )
        if other_grade_id is None:
            other_grade_id = await author.fetchval(
                """
                insert into app.grade_levels (name, level)
                values ($1, 5)
                returning grade_id
                """,
                f"Grade 5 race {SUFFIX}",
            )
            created_other_grade = True
        competency_id = await author.fetchval(
            """
            insert into app.competencies (code, grade_id, domain, name, status)
            values ($1, $2, 'Number Sense', 'Concurrent wrong-grade competency',
                    'published')
            returning competency_id
            """,
            f"RACE-{SUFFIX}",
            other_grade_id,
        )
        question_id = await author.fetchval(
            """
            insert into app.questions
              (competency_id, question_type, prompt, answer_key, status)
            values ($1, 'number_input', 'Concurrent wrong-grade question?',
                    '5'::jsonb, 'published')
            returning question_id
            """,
            competency_id,
        )

        await starter_transaction.start()
        await starter.execute(
            "set local role authenticated"
        )
        await starter.execute(
            "select set_config('request.jwt.claims', $1, true)",
            json.dumps(token_for(LEARNER).claims),
        )
        attempt_id = await starter.fetchval(
            "select attempt_id from app.start_assessment_attempt($1)",
            seeded["assessment_id"],
        )

        await author_transaction.start()
        author_task = asyncio.create_task(
            author.execute(
                """
                insert into app.assessment_questions
                  (assessment_id, question_id, position)
                values ($1, $2, 3)
                """,
                seeded["assessment_id"],
                question_id,
            )
        )
        await asyncio.sleep(0.1)
        assert not author_task.done()

        await starter_transaction.commit()
        with pytest.raises(
            asyncpg.PostgresError,
            match="Assessment questions must match the assessment grade",
        ) as rejected:
            await author_task
        assert rejected.value.sqlstate == "P0004"
        await author_transaction.rollback()

        assert await author.fetchval(
            "select count(*) from app.assessment_responses where attempt_id = $1",
            attempt_id,
        ) == 2
        assert not await author.fetchval(
            """
            select exists (
              select 1 from app.assessment_questions
              where assessment_id = $1 and question_id = $2
            )
            """,
            seeded["assessment_id"],
            question_id,
        )
    finally:
        if author_task is not None and not author_task.done():
            author_task.cancel()
            with suppress(asyncio.CancelledError):
                await author_task
        if starter.is_in_transaction():
            await starter_transaction.rollback()
        if author.is_in_transaction():
            await author_transaction.rollback()
        if question_id is not None:
            await author.execute("delete from app.questions where question_id = $1", question_id)
        if competency_id is not None:
            await author.execute(
                "delete from app.competencies where competency_id = $1", competency_id
            )
        if created_other_grade and other_grade_id is not None:
            await author.execute(
                "delete from app.grade_levels where grade_id = $1", other_grade_id
            )
        await starter.close()
        await author.close()


async def test_expired_autosave_is_rejected_and_late_submit_uses_saved_answers(
    database, seeded
):
    owner = await asyncpg.connect(DB_URL, statement_cache_size=0)
    attempt_id = None
    try:
        async with database.actor(token_for(LEARNER)) as connection:
            attempt = await repository.start_attempt(connection, seeded["assessment_id"])
            attempt_id = attempt["attempt_id"]
            first_question = seeded["questions"][0]
            await repository.save_answers(
                connection,
                attempt_id=attempt_id,
                answers=json.dumps(
                    [{"question_id": str(first_question), "answer": "72"}]
                ),
            )

        await owner.execute("set session_replication_role = replica")
        await owner.execute(
            """
            update app.assessment_attempts
            set started_at = clock_timestamp()
              - make_interval(mins => (assessment_payload ->> 'duration_minutes')::integer)
            where attempt_id = $1
            """,
            attempt_id,
        )
        await owner.execute("set session_replication_role = origin")

        late_answers = json.dumps(
            [
                {"question_id": str(seeded["questions"][0]), "answer": "wrong"},
                {"question_id": str(seeded["questions"][1]), "answer": "4.2"},
            ]
        )
        async with database.actor(token_for(LEARNER)) as connection:
            with pytest.raises(asyncpg.PostgresError) as expired:
                await repository.save_answers(
                    connection, attempt_id=attempt_id, answers=late_answers
                )
        assert expired.value.sqlstate == "P0005"

        async with database.actor(token_for(LEARNER)) as connection:
            scored = await repository.submit_attempt(
                connection, attempt_id=attempt_id, answers=late_answers
            )

        assert str(scored["status"]) == "scored"
        answers = await owner.fetch(
            """
            select question_id, answer
            from app.assessment_responses
            where attempt_id = $1
            order by delivered_position
            """,
            attempt_id,
        )
        assert json.loads(answers[0]["answer"]) == "72"
        assert answers[1]["answer"] is None
    finally:
        await owner.execute("set session_replication_role = origin")
        if attempt_id is not None:
            await owner.execute(
                "delete from app.assessment_attempts where attempt_id = $1", attempt_id
            )
        await owner.close()


async def test_moved_learner_cannot_save_or_submit_known_open_attempt(database, seeded):
    owner = await asyncpg.connect(DB_URL, statement_cache_size=0)
    moved_grade_id = None
    created_moved_grade = False
    attempt_id = None
    try:
        async with database.actor(token_for(LEARNER)) as connection:
            attempt = await repository.start_attempt(connection, seeded["assessment_id"])
            attempt_id = attempt["attempt_id"]

        moved_grade_id = await owner.fetchval(
            "select grade_id from app.grade_levels where level = 5"
        )
        if moved_grade_id is None:
            moved_grade_id = await owner.fetchval(
                """
                insert into app.grade_levels (name, level)
                values ($1, 5)
                returning grade_id
                """,
                f"Grade 5 integration {SUFFIX}",
            )
            created_moved_grade = True
        await owner.execute(
            "update app.student_profiles set grade_id = $1 where student_id = $2",
            moved_grade_id,
            seeded["student_id"],
        )

        async with database.actor(token_for(LEARNER)) as connection:
            with pytest.raises(asyncpg.RaiseError, match="not available for your grade") as saved:
                await repository.save_answers(
                    connection, attempt_id=attempt_id, answers=_answers(seeded)
                )
        assert saved.value.sqlstate == "P0001"

        async with database.actor(token_for(LEARNER)) as connection:
            with pytest.raises(
                asyncpg.RaiseError, match="not available for your grade"
            ) as submitted:
                await repository.submit_attempt(
                    connection, attempt_id=attempt_id, answers=_answers(seeded)
                )
        assert submitted.value.sqlstate == "P0001"

        assert await owner.fetchval(
            """
            select count(*) from app.assessment_responses
            where attempt_id = $1 and (answer is not null or is_correct is not null)
            """,
            attempt_id,
        ) == 0
        state = await owner.fetchrow(
            """
            select status, overall_score, submitted_at, result_payload
            from app.assessment_attempts where attempt_id = $1
            """,
            attempt_id,
        )
        assert str(state["status"]) == "in_progress"
        assert state["overall_score"] is None
        assert state["submitted_at"] is None
        assert state["result_payload"] is None
        assert await owner.fetchval(
            "select count(*) from app.competency_results where attempt_id = $1",
            attempt_id,
        ) == 0
        assert await owner.fetchval(
            "select count(*) from app.competency_progress where student_id = $1",
            seeded["student_id"],
        ) == 0
        assert await owner.fetchval(
            "select count(*) from app.learning_path_items where student_id = $1",
            seeded["student_id"],
        ) == 0
    finally:
        await owner.execute(
            """
            update app.student_profiles
            set grade_id = (select grade_id from app.grade_levels where level = 6)
            where student_id = $1
            """,
            seeded["student_id"],
        )
        if created_moved_grade and moved_grade_id is not None:
            await owner.execute(
                """
                delete from app.grade_levels
                where grade_id = $1
                  and not exists (
                    select 1 from app.student_profiles where grade_id = $1
                  )
                """,
                moved_grade_id,
            )
        await owner.close()


async def test_a_submission_is_graded_against_the_stored_key(database, seeded):
    answers = json.dumps(
        [
            {"question_id": str(seeded["questions"][0]), "answer": "72"},
            {"question_id": str(seeded["questions"][1]), "answer": "9"},
        ]
    )
    async with database.actor(token_for(LEARNER)) as connection:
        attempt = await repository.start_attempt(connection, seeded["assessment_id"])
        scored = await repository.submit_attempt(
            connection, attempt_id=attempt["attempt_id"], answers=answers
        )
        results = await repository.results_for(connection, attempt["attempt_id"])
        path = await repository.path_for(connection, scored["student_id"])

    assert str(scored["status"]) == "scored"
    assert float(scored["overall_score"]) == 50.0
    assert float(results[0]["percentage"]) == 50.0
    assert str(results[0]["mastery_band"]) == "Developing"
    # Not mastered, so the learner is given the module for that competency.
    assert len(path) == 1
    assert path[0]["module_id"] == seeded["module_id"]
    assert str(path[0]["status"]) == "available"


async def test_backfilled_legacy_report_reads_from_payload_only(database, seeded):
    owner = await asyncpg.connect(DB_URL, statement_cache_size=0)
    attempt_id = uuid4()
    try:
        await owner.execute(
            """
            insert into app.assessment_attempts
              (attempt_id, assessment_id, student_id, status, overall_score,
               submitted_at, assessment_grade_id_snapshot, result_payload)
            values ($1, $2, $3, 'scored', 100.00, now(),
                    (select grade_id from app.grade_levels where level = 6), null)
            """,
            attempt_id,
            seeded["assessment_id"],
            seeded["student_id"],
        )
        await owner.execute(
            """
            insert into app.competency_results
              (attempt_id, competency_id, raw_score, max_score, percentage, mastery_band)
            values ($1, $2, 1, 1, 100.00, 'Mastered')
            """,
            attempt_id,
            seeded["competency_id"],
        )
        assert await owner.fetchval(
            "select app.backfill_legacy_assessment_reports()"
        ) == 1

        async with database.actor(token_for(LEARNER)) as connection:
            restored = await repository.attempt(connection, attempt_id)

        payload = restored["result_payload"]
        if isinstance(payload, str):
            payload = json.loads(payload)
        assert payload["attempt_id"] == str(attempt_id)
        assert payload["overall_score"] == 100.0
        assert payload["recommended_learning_path"] == []
        assert payload["next_action"]["type"] == "dashboard"
        assert payload["competency_results"][0]["competency_name"] == "Grading competency"
    finally:
        await owner.close()


async def test_two_submissions_keep_attempt_specific_paths_immutable(database, seeded):
    first_answers = json.dumps(
        [
            {"question_id": str(seeded["questions"][0]), "answer": "72"},
            {"question_id": str(seeded["questions"][1]), "answer": "9"},
        ]
    )
    mastered_answers = json.dumps(
        [
            {"question_id": str(seeded["questions"][0]), "answer": "72"},
            {"question_id": str(seeded["questions"][1]), "answer": "4.2"},
        ]
    )
    owner = await asyncpg.connect(DB_URL, statement_cache_size=0)
    try:
        async with database.actor(token_for(LEARNER)) as connection:
            first = await repository.start_attempt(connection, seeded["assessment_id"])
            first_scored = await repository.submit_attempt(
                connection, attempt_id=first["attempt_id"], answers=first_answers
            )
        first_report = json.loads(first_scored["result_payload"])
        assert len(first_report["recommended_learning_path"]) == 1

        await _grant(owner, seeded)
        async with database.actor(token_for(LEARNER)) as connection:
            second = await repository.start_attempt(connection, seeded["assessment_id"])
            second_scored = await repository.submit_attempt(
                connection, attempt_id=second["attempt_id"], answers=mastered_answers
            )
        second_report = json.loads(second_scored["result_payload"])
        restored_first = json.loads(
            await owner.fetchval(
                "select result_payload from app.assessment_attempts where attempt_id = $1",
                first["attempt_id"],
            )
        )

        assert second_report["recommended_learning_path"] == []
        assert restored_first == first_report
        assert len(restored_first["recommended_learning_path"]) == 1
    finally:
        await owner.close()


async def test_selected_diagnostic_status_does_not_inherit_another_assessment(
    database, seeded
):
    other_assessment = None
    owner = await asyncpg.connect(DB_URL, statement_cache_size=0)
    try:
        other_assessment = await owner.fetchval(
            """
            insert into app.assessments
              (grade_id, title, assessment_type, status, duration_minutes)
            values ((select grade_id from app.grade_levels where level = 6),
                    $1, 'diagnostic', 'published', 15)
            returning assessment_id
            """,
            f"Other diagnostic {SUFFIX}",
        )
        await _score_an_attempt(database, seeded)

        async with database.actor(token_for(LEARNER)) as connection:
            selected = await repository.diagnostic_status(
                connection, seeded["student_id"], other_assessment
            )
            unfiltered = await repository.diagnostic_status(
                connection, seeded["student_id"]
            )

        assert str(selected["diagnostic_status"]) == "not_started"
        assert selected["assessment_id"] == other_assessment
        assert selected["latest_attempt_id"] is None
        assert selected["latest_status"] is None
        assert selected["reassessment_eligible"] is False
        assert str(unfiltered["diagnostic_status"]) == "completed"
        assert str(unfiltered["latest_status"]) == "scored"
    finally:
        if other_assessment is not None:
            await owner.execute(
                "delete from app.assessments where assessment_id = $1", other_assessment
            )
        await owner.close()


async def test_another_learner_cannot_submit_the_attempt(database, seeded):
    async with database.actor(token_for(LEARNER)) as connection:
        attempt = await repository.start_attempt(connection, seeded["assessment_id"])

    async with database.actor(token_for(OTHER_LEARNER)) as connection:
        with pytest.raises(asyncpg.PostgresError):
            await repository.submit_attempt(
                connection, attempt_id=attempt["attempt_id"], answers=None
            )


async def test_a_learner_sees_only_their_own_attempt(database, seeded):
    async with database.actor(token_for(LEARNER)) as connection:
        await repository.start_attempt(connection, seeded["assessment_id"])

    async with database.actor(token_for(OTHER_LEARNER)) as connection:
        visible = await connection.fetch("select attempt_id from app.assessment_attempts")

    assert visible == []


# ---------------------------------------------------------------------------
# Reassessment
# ---------------------------------------------------------------------------
# The educator's grant is what reopens a scored assessment, and it opens exactly
# one. The pgTAP suite proves the rules inside one transaction; these prove them
# across the real connections the API uses, including two at the same time.


async def _grant(owner, seeded) -> UUID:
    return await owner.fetchval(
        """
        insert into app.reassessment_authorizations
          (student_id, assessment_id, authorized_by, reason)
        values ($1, $2, $3, 'Interrupted by a power cut during the diagnostic.')
        returning authorization_id
        """,
        seeded["student_id"], seeded["assessment_id"], seeded["teacher_admin_id"],
    )


async def _score_an_attempt(database, seeded) -> UUID:
    async with database.actor(token_for(LEARNER)) as connection:
        attempt = await repository.start_attempt(connection, seeded["assessment_id"])
        await repository.submit_attempt(
            connection, attempt_id=attempt["attempt_id"], answers="[]"
        )
    return attempt["attempt_id"]


async def test_a_scored_assessment_cannot_be_retaken_without_a_grant(database, seeded):
    await _score_an_attempt(database, seeded)

    async with database.actor(token_for(LEARNER)) as connection:
        with pytest.raises(asyncpg.InsufficientPrivilegeError):
            await repository.start_attempt(connection, seeded["assessment_id"])


async def _held_actor(user_id: UUID):
    """A transaction that stays open until it is told to finish.

    `Database.actor` commits when its block exits, which is right for a request
    and useless for a race: nothing would still be uncommitted when the second
    caller runs. This opens the same kind of transaction — the actor context
    installed as the first statement — on a connection of its own, and hands it
    back for the test to hold.
    """
    connection = await asyncpg.connect(DB_URL, statement_cache_size=0)
    context = build_actor_context(token_for(user_id))
    transaction = connection.transaction(isolation="read_committed")
    await transaction.start()
    await connection.execute(context.sql, *context.params)
    return connection, transaction


async def _start_attempt(database, seeded) -> UUID:
    async with database.actor(token_for(LEARNER)) as connection:
        attempt = await repository.start_attempt(connection, seeded["assessment_id"])
    return attempt["attempt_id"]


def _answers(seeded) -> str:
    return json.dumps(
        [
            {"question_id": str(seeded["questions"][0]), "answer": "72"},
            {"question_id": str(seeded["questions"][1]), "answer": "4.2"},
        ],
        separators=(",", ":"),
    )


def _response_body(scored) -> str:
    payload = scored["result_payload"]
    if isinstance(payload, str):
        payload = json.loads(payload)
    return json.dumps({"data": payload}, separators=(",", ":"))


async def _assert_scored_once(owner, seeded, attempt_id, idempotency_key) -> None:
    assert await owner.fetchval(
        """
        select count(*) from app.assessment_attempts
        where attempt_id = $1 and status = 'scored'
        """,
        attempt_id,
    ) == 1
    assert await owner.fetchval(
        "select count(*) from app.competency_results where attempt_id = $1",
        attempt_id,
    ) == 1
    assert await owner.fetchval(
        """
        select attempt_count from app.competency_progress
        where student_id = $1 and competency_id = $2
        """,
        seeded["student_id"], seeded["competency_id"],
    ) == 1
    assert await owner.fetchval(
        """
        select count(*) from app.idempotency_keys
        where user_id = $1
          and endpoint = 'POST /assessment-attempts/{id}/submit'
          and idempotency_key = $2
        """,
        LEARNER, idempotency_key,
    ) == 1


async def _cleanup_race(contested, transactions, connections) -> None:
    if contested is not None and not contested.done():
        contested.cancel()
        with suppress(asyncio.CancelledError):
            await contested
    for transaction in transactions:
        if transaction is not None:
            with suppress(Exception):
                await transaction.rollback()
    for connection in connections:
        if connection is not None:
            await connection.close()


async def test_completed_submission_replays_exact_response_without_second_score(database, seeded):
    attempt_id = await _start_attempt(database, seeded)
    idempotency_key = f"submit-{uuid4()}"
    fingerprint = f"fingerprint-{uuid4()}"
    body = None

    async with database.actor(token_for(LEARNER)) as connection:
        claim = await repository.claim_submission(
            connection,
            idempotency_key=idempotency_key,
            request_fingerprint=fingerprint,
        )
        assert claim["claim_status"] == "claimed"
        scored = await repository.submit_attempt(
            connection, attempt_id=attempt_id, answers=_answers(seeded)
        )
        body = _response_body(scored)
        assert await repository.complete_submission(
            connection,
            idempotency_key=idempotency_key,
            request_fingerprint=fingerprint,
            response_status=200,
            response_body=body,
        )

    async with database.actor(token_for(LEARNER)) as connection:
        replay = await repository.claim_submission(
            connection,
            idempotency_key=idempotency_key,
            request_fingerprint=fingerprint,
        )

    replay_body = replay["response_body"]
    if isinstance(replay_body, str):
        replay_body = json.loads(replay_body)
    assert replay["claim_status"] == "replay"
    assert replay["response_status"] == 200
    assert replay_body == json.loads(body)

    owner = await asyncpg.connect(DB_URL, statement_cache_size=0)
    try:
        await _assert_scored_once(owner, seeded, attempt_id, idempotency_key)
    finally:
        await owner.close()


async def test_changed_fingerprint_conflicts_without_scoring(database, seeded):
    attempt_id = await _start_attempt(database, seeded)
    idempotency_key = f"submit-{uuid4()}"
    fingerprint = f"fingerprint-{uuid4()}"

    async with database.actor(token_for(LEARNER)) as connection:
        claim = await repository.claim_submission(
            connection,
            idempotency_key=idempotency_key,
            request_fingerprint=fingerprint,
        )
        assert claim["claim_status"] == "claimed"

    async with database.actor(token_for(LEARNER)) as connection:
        conflict = await repository.claim_submission(
            connection,
            idempotency_key=idempotency_key,
            request_fingerprint=f"fingerprint-{uuid4()}",
        )

    assert conflict["claim_status"] == "conflict"
    owner = await asyncpg.connect(DB_URL, statement_cache_size=0)
    try:
        assert await owner.fetchval(
            "select status = 'in_progress' from app.assessment_attempts where attempt_id = $1",
            attempt_id,
        )
        assert await owner.fetchval(
            "select count(*) from app.competency_results where attempt_id = $1", attempt_id
        ) == 0
        assert await owner.fetchval(
            """
            select count(*) from app.competency_progress
            where student_id = $1 and competency_id = $2
            """,
            seeded["student_id"], seeded["competency_id"],
        ) == 0
    finally:
        await owner.close()


async def test_rolled_back_winner_releases_key_and_loser_scores_once(database, seeded):
    attempt_id = await _start_attempt(database, seeded)
    idempotency_key = f"submit-{uuid4()}"
    fingerprint = f"fingerprint-{uuid4()}"
    winner = winner_transaction = loser = loser_transaction = contested = None
    try:
        winner, winner_transaction = await _held_actor(LEARNER)
        winner_claim = await repository.claim_submission(
            winner,
            idempotency_key=idempotency_key,
            request_fingerprint=fingerprint,
        )
        assert winner_claim["claim_status"] == "claimed"
        winner_scored = await repository.submit_attempt(
            winner, attempt_id=attempt_id, answers=_answers(seeded)
        )
        winner_body = _response_body(winner_scored)
        assert await repository.complete_submission(
            winner,
            idempotency_key=idempotency_key,
            request_fingerprint=fingerprint,
            response_status=200,
            response_body=winner_body,
        )

        loser, loser_transaction = await _held_actor(LEARNER)
        contested = asyncio.create_task(
            repository.claim_submission(
                loser,
                idempotency_key=idempotency_key,
                request_fingerprint=fingerprint,
            )
        )
        done, _pending = await asyncio.wait({contested}, timeout=2)
        assert not done, "the second submission did not wait for the first"

        await winner_transaction.rollback()
        winner_transaction = None
        loser_claim = await asyncio.wait_for(contested, timeout=10)
        contested = None
        assert loser_claim["claim_status"] == "claimed"

        loser_scored = await repository.submit_attempt(
            loser, attempt_id=attempt_id, answers=_answers(seeded)
        )
        loser_body = _response_body(loser_scored)
        assert await repository.complete_submission(
            loser,
            idempotency_key=idempotency_key,
            request_fingerprint=fingerprint,
            response_status=200,
            response_body=loser_body,
        )
        await loser_transaction.commit()
        loser_transaction = None

        winner_report = json.loads(winner_body)["data"]
        loser_report = json.loads(loser_body)["data"]
        assert loser_report["attempt_id"] == winner_report["attempt_id"]
        assert loser_report["overall_score"] == winner_report["overall_score"]
        assert loser_report["competency_results"] == winner_report["competency_results"]
        assert (
            loser_report["recommended_learning_path"]
            == winner_report["recommended_learning_path"]
        )

        owner = await asyncpg.connect(DB_URL, statement_cache_size=0)
        try:
            await _assert_scored_once(owner, seeded, attempt_id, idempotency_key)
        finally:
            await owner.close()
    finally:
        await _cleanup_race(
            contested,
            (winner_transaction, loser_transaction),
            (winner, loser),
        )


async def test_one_grant_is_contested_by_two_open_transactions(database, seeded):
    """Two transactions, one grant, the second held against the first.

    The first opens the reassessment and consumes the grant, and is kept open.
    The second then asks for the same reassessment: it must wait while the first
    outcome is unknown, then resume the committed open attempt rather than spend
    the grant again or create a duplicate.
    """
    await _score_an_attempt(database, seeded)
    owner = await asyncpg.connect(DB_URL, statement_cache_size=0)
    winner = winner_transaction = loser = loser_transaction = None
    try:
        authorization_id = await _grant(owner, seeded)

        winner, winner_transaction = await _held_actor(LEARNER)
        opened = await winner.fetchrow(
            "select * from app.start_assessment_attempt($1)", seeded["assessment_id"]
        )
        assert str(opened["status"]) == "in_progress"

        loser, loser_transaction = await _held_actor(LEARNER)
        contested = asyncio.create_task(
            loser.fetchrow(
                "select * from app.start_assessment_attempt($1)", seeded["assessment_id"]
            )
        )

        # It blocks: the grant it wants is locked by a transaction that has not
        # said yet whether it will keep it.
        done, _pending = await asyncio.wait({contested}, timeout=2)
        assert not done, "the second caller did not wait for the first"

        await winner_transaction.commit()

        resumed = await asyncio.wait_for(contested, timeout=10)
        assert resumed["attempt_id"] == opened["attempt_id"]
        assert resumed["resumed"] is True

        await loser_transaction.rollback()

        granted = await owner.fetchrow(
            """
            select consumed_at, consumed_attempt_id
            from app.reassessment_authorizations
            where authorization_id = $1
            """,
            authorization_id,
        )
        assert granted["consumed_at"] is not None
        assert granted["consumed_attempt_id"] == opened["attempt_id"]

        attempts = await owner.fetchval(
            """
            select count(*) from app.assessment_attempts
            where student_id = $1 and assessment_id = $2
            """,
            seeded["student_id"], seeded["assessment_id"],
        )
        assert attempts == 2
    finally:
        for connection in (winner, loser):
            if connection is not None:
                await connection.close()
        await owner.close()


async def test_a_spent_grant_cannot_be_used_again(database, seeded):
    await _score_an_attempt(database, seeded)
    owner = await asyncpg.connect(DB_URL, statement_cache_size=0)
    try:
        await _grant(owner, seeded)

        async with database.actor(token_for(LEARNER)) as connection:
            retake = await repository.start_attempt(connection, seeded["assessment_id"])
            await repository.submit_attempt(
                connection, attempt_id=retake["attempt_id"], answers="[]"
            )

        async with database.actor(token_for(LEARNER)) as connection:
            with pytest.raises(asyncpg.InsufficientPrivilegeError):
                await repository.start_attempt(connection, seeded["assessment_id"])
    finally:
        await owner.close()
