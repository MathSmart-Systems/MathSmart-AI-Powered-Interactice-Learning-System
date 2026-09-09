"""Row Level Security holds even when the application forgets to check.

Every test here deliberately skips the service layer and asks the database
directly, as a specific learner, for another learner's rows. There is no
authorization check anywhere in these code paths — that is the point. If the
backend's actor context were wrong, or if an ordinary request ran as an elevated
role, these would return data and the tests would fail.

Requires a live PostgreSQL with the MathSmart migrations applied. Set
MATHSMART_TEST_DB_URL to run them; they are skipped otherwise.
"""

from __future__ import annotations

import os
from uuid import UUID, uuid4

import asyncpg
import pytest
from pydantic import SecretStr

from middleware.auth import MathSmartRole, VerifiedToken
from modules.shared.db import Database

DB_URL = os.environ.get("MATHSMART_TEST_DB_URL")

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(not DB_URL, reason="MATHSMART_TEST_DB_URL is not set"),
]

LEARNER_ONE = uuid4()
LEARNER_TWO = uuid4()
ADVISER = uuid4()
# Identifiers are stored normalised in upper case; email addresses are stored
# normalised in lower case. Both constraints are real, so the fixture honours both.
SUFFIX = uuid4().hex[:8].upper()
EMAIL_SUFFIX = SUFFIX.lower()


def token_for(user_id: UUID, role: MathSmartRole) -> VerifiedToken:
    return VerifiedToken(
        user_id=user_id,
        role=role,
        claims={
            "sub": str(user_id),
            "aud": "authenticated",
            "app_metadata": {"role": role.value},
        },
    )


@pytest.fixture
async def seeded() -> None:
    """Two learners with their own evidence, and one Teacher/Administrator.

    Statements are issued one at a time: asyncpg prepares any statement that
    carries bind parameters, and a prepared statement cannot contain more than
    one command.
    """
    owner = await asyncpg.connect(DB_URL, statement_cache_size=0)
    email_one = f"rls.one.{EMAIL_SUFFIX}@mathsmart.test"
    email_two = f"rls.two.{EMAIL_SUFFIX}@mathsmart.test"
    email_adviser = f"rls.adviser.{EMAIL_SUFFIX}@mathsmart.test"
    competency_code = f"RLSX-{SUFFIX}"
    try:
        await owner.execute(
            "insert into auth.users (id, email) values ($1, $2), ($3, $4), ($5, $6)",
            LEARNER_ONE, email_one, LEARNER_TWO, email_two, ADVISER, email_adviser,
        )
        await owner.execute(
            """
            insert into app.user_profiles (user_id, full_name, email, role) values
              ($1, 'RLS Learner One', $2, 'student'),
              ($3, 'RLS Learner Two', $4, 'student'),
              ($5, 'RLS Adviser', $6, 'teacher_admin')
            """,
            LEARNER_ONE, email_one, LEARNER_TWO, email_two, ADVISER, email_adviser,
        )
        await owner.execute(
            """
            insert into app.teacher_admin_profiles
              (user_id, employee_id, school_name, division_name)
            values ($1, $2, 'Sample School', 'Sample Division')
            """,
            ADVISER, f"EMP-{SUFFIX}",
        )
        await owner.execute(
            """
            insert into app.student_profiles (user_id, learner_id, grade_id) values
              ($1, $2, (select grade_id from app.grade_levels where level = 6)),
              ($3, $4, (select grade_id from app.grade_levels where level = 6))
            """,
            LEARNER_ONE, f"LRN-A-{SUFFIX}", LEARNER_TWO, f"LRN-B-{SUFFIX}",
        )
        await owner.execute(
            """
            insert into app.competencies (code, grade_id, domain, name, status)
            values ($1, (select grade_id from app.grade_levels where level = 6),
                    'Number Sense', 'RLS enforcement competency', 'published')
            """,
            competency_code,
        )
        await owner.execute(
            """
            insert into app.competency_progress
              (student_id, competency_id, current_score, mastery_band)
            select student_profiles.student_id,
                   (select competency_id from app.competencies where code = $3),
                   case when student_profiles.user_id = $1 then 40.00 else 90.00 end,
                   case when student_profiles.user_id = $1
                        then 'Needs Improvement'::app.mastery_band
                        else 'Mastered'::app.mastery_band end
            from app.student_profiles
            where student_profiles.user_id in ($1, $2)
            """,
            LEARNER_ONE, LEARNER_TWO, competency_code,
        )
        await owner.execute(
            """
            insert into app.questions
              (competency_id, question_type, prompt, answer_key, status)
            values ((select competency_id from app.competencies where code = $1),
                    'number_input', 'RLS enforcement prompt', '{"value":7}'::jsonb, 'published')
            """,
            competency_code,
        )
        yield
    finally:
        await owner.execute(
            "delete from app.competencies where code = $1", competency_code
        )
        await owner.execute(
            "delete from auth.users where id = any($1::uuid[])",
            [LEARNER_ONE, LEARNER_TWO, ADVISER],
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


async def test_an_ordinary_request_runs_as_the_authenticated_role(database, seeded):
    """Not as the pool's login role, and not as anything with BYPASSRLS."""
    async with database.actor(token_for(LEARNER_ONE, MathSmartRole.STUDENT)) as connection:
        assert await connection.fetchval("select current_user") == "authenticated"


async def test_the_verified_subject_reaches_auth_uid(database, seeded):
    async with database.actor(token_for(LEARNER_ONE, MathSmartRole.STUDENT)) as connection:
        assert await connection.fetchval("select auth.uid()") == LEARNER_ONE


async def test_a_learner_reads_only_their_own_profile(database, seeded):
    async with database.actor(token_for(LEARNER_ONE, MathSmartRole.STUDENT)) as connection:
        rows = await connection.fetch("select user_id from app.student_profiles")

    assert [row["user_id"] for row in rows] == [LEARNER_ONE]


async def test_asking_directly_for_another_learners_profile_returns_nothing(database, seeded):
    """No authorization check runs in this test. The database refuses anyway."""
    async with database.actor(token_for(LEARNER_ONE, MathSmartRole.STUDENT)) as connection:
        rows = await connection.fetch(
            "select user_id from app.student_profiles where user_id = $1", LEARNER_TWO
        )

    assert rows == []


async def test_asking_directly_for_another_learners_progress_returns_nothing(database, seeded):
    async with database.actor(token_for(LEARNER_ONE, MathSmartRole.STUDENT)) as connection:
        rows = await connection.fetch(
            """
            select current_score
            from app.competency_progress
            join app.student_profiles
              on student_profiles.student_id = competency_progress.student_id
            where student_profiles.user_id = $1
            """,
            LEARNER_TWO,
        )

    assert rows == []


async def test_a_learner_cannot_widen_the_query_to_the_whole_cohort(database, seeded):
    async with database.actor(token_for(LEARNER_ONE, MathSmartRole.STUDENT)) as connection:
        scores = await connection.fetch("select current_score from app.competency_progress")

    assert len(scores) == 1


async def test_a_learner_cannot_write_another_learners_record(database, seeded):
    async with database.actor(token_for(LEARNER_ONE, MathSmartRole.STUDENT)) as connection:
        with pytest.raises(asyncpg.InsufficientPrivilegeError):
            await connection.execute("update app.competency_progress set current_score = 100")


async def test_a_learner_cannot_read_an_answer_key(database, seeded):
    async with database.actor(token_for(LEARNER_ONE, MathSmartRole.STUDENT)) as connection:
        with pytest.raises(asyncpg.InsufficientPrivilegeError):
            await connection.fetch("select answer_key from app.questions")


async def test_a_learner_reads_no_intervention(database, seeded):
    async with database.actor(token_for(LEARNER_ONE, MathSmartRole.STUDENT)) as connection:
        assert await connection.fetch("select 1 from app.interventions") == []


async def test_a_teacher_admin_reads_the_cohort(database, seeded):
    async with database.actor(token_for(ADVISER, MathSmartRole.TEACHER_ADMIN)) as connection:
        rows = await connection.fetch(
            "select user_id from app.student_profiles where user_id = any($1::uuid[])",
            [LEARNER_ONE, LEARNER_TWO],
        )

    assert len(rows) == 2


async def test_even_a_teacher_admin_cannot_read_an_answer_key(database, seeded):
    async with database.actor(token_for(ADVISER, MathSmartRole.TEACHER_ADMIN)) as connection:
        with pytest.raises(asyncpg.InsufficientPrivilegeError):
            await connection.fetch("select answer_key from app.questions")


async def test_actor_context_does_not_leak_between_transactions(database, seeded):
    """The second caller must not inherit the first caller's identity."""
    async with database.actor(token_for(LEARNER_ONE, MathSmartRole.STUDENT)) as connection:
        first = await connection.fetchval("select auth.uid()")

    async with database.actor(token_for(LEARNER_TWO, MathSmartRole.STUDENT)) as connection:
        second = await connection.fetchval("select auth.uid()")
        rows = await connection.fetch("select user_id from app.student_profiles")

    assert first == LEARNER_ONE
    assert second == LEARNER_TWO
    assert [row["user_id"] for row in rows] == [LEARNER_TWO]


async def test_the_role_reverts_when_the_transaction_ends(database, seeded):
    """A pooled connection must not stay dropped into the authenticated role."""
    async with database.actor(token_for(LEARNER_ONE, MathSmartRole.STUDENT)):
        pass

    owner = await asyncpg.connect(DB_URL, statement_cache_size=0)
    try:
        assert await owner.fetchval("select current_setting('role', true)") in (None, "", "none")
    finally:
        await owner.close()
