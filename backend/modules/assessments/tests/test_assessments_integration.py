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
    transaction = connection.transaction()
    await transaction.start()
    await connection.execute(context.sql, *context.params)
    return connection, transaction


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
