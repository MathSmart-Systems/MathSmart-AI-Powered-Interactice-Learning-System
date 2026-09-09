"""Module progress against a real PostgreSQL.

Two things can only be proved here. First, that the backend's idea of a module's
sections and the database's idea are the same list — they are computed
separately, and a drift between them would silently change what "complete"
means. Second, that a learner writing progress through the actor-scoped
connection writes their own row and nobody else's, with no application check in
front of it.

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
from modules.learning_modules import repository, service
from modules.shared.db import Database

DB_URL = os.environ.get("MATHSMART_TEST_DB_URL")

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(not DB_URL, reason="MATHSMART_TEST_DB_URL is not set"),
]

LEARNER_ONE = uuid4()
LEARNER_TWO = uuid4()
SUFFIX = uuid4().hex[:8].upper()
EMAIL_SUFFIX = SUFFIX.lower()

RULES = '[{"title": "Same signs"}, {"title": "Different signs"}]'
EXAMPLES = '[{"problem": "(-6) x (-4)"}]'


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
    """One published module with two rules and one worked example, two learners."""
    owner = await asyncpg.connect(DB_URL, statement_cache_size=0)
    email_one = f"modules.one.{EMAIL_SUFFIX}@mathsmart.test"
    email_two = f"modules.two.{EMAIL_SUFFIX}@mathsmart.test"
    competency_id = None
    module_id = None
    try:
        await owner.execute(
            "insert into auth.users (id, email) values ($1, $2), ($3, $4)",
            LEARNER_ONE, email_one, LEARNER_TWO, email_two,
        )
        await owner.execute(
            """
            insert into app.user_profiles (user_id, full_name, email, role) values
              ($1, 'Modules Learner One', $2, 'student'),
              ($3, 'Modules Learner Two', $4, 'student')
            """,
            LEARNER_ONE, email_one, LEARNER_TWO, email_two,
        )
        await owner.execute(
            """
            insert into app.student_profiles (user_id, learner_id, grade_id) values
              ($1, $2, (select grade_id from app.grade_levels where level = 6)),
              ($3, $4, (select grade_id from app.grade_levels where level = 6))
            """,
            LEARNER_ONE, f"LRN-M1-{SUFFIX}", LEARNER_TWO, f"LRN-M2-{SUFFIX}",
        )
        competency_id = await owner.fetchval(
            """
            insert into app.competencies (code, grade_id, domain, name, status)
            values ($1, (select grade_id from app.grade_levels where level = 6),
                    'Number Sense', 'Module progress competency', 'published')
            returning competency_id
            """,
            f"MODX-{SUFFIX}",
        )
        module_id = await owner.fetchval(
            """
            insert into app.learning_modules
              (competency_id, title, estimated_minutes, learning_objective,
               short_explanation, rules, worked_examples, status, order_index)
            values ($1, $2, 15, 'Apply the rule.', 'Equal signs give a positive result.',
                    $3::jsonb, $4::jsonb, 'published', 1)
            returning module_id
            """,
            competency_id, f"Module progress module {SUFFIX}", RULES, EXAMPLES,
        )
        yield {"competency_id": competency_id, "module_id": module_id}
    finally:
        # Reverse dependency order: every foreign key here is ON DELETE RESTRICT.
        if module_id is not None:
            await owner.execute(
                "delete from app.student_module_progress where module_id = $1", module_id
            )
            await owner.execute(
                "delete from app.learning_modules where module_id = $1", module_id
            )
        if competency_id is not None:
            await owner.execute(
                "delete from app.competencies where competency_id = $1", competency_id
            )
        await owner.execute(
            "delete from auth.users where id = any($1::uuid[])", [LEARNER_ONE, LEARNER_TWO]
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


async def test_the_backend_and_the_database_agree_on_a_modules_sections(seeded):
    """Two implementations of one rule. They must produce the same list."""
    owner = await asyncpg.connect(DB_URL, statement_cache_size=0)
    try:
        from_database = await owner.fetchval(
            "select app.module_section_ids($1)", seeded["module_id"]
        )
    finally:
        await owner.close()

    assert service.section_ids(rules=RULES, worked_examples=EXAMPLES) == list(from_database)


async def test_a_learner_saves_their_own_progress_through_the_actor_connection(
    database, seeded
):
    async with database.actor(token_for(LEARNER_ONE)) as connection:
        row = await repository.save_progress(
            connection,
            module_id=seeded["module_id"],
            completed_section_ids=["objective", "concept"],
            last_section_id="concept",
        )

    # Two of the module's five sections.
    assert float(row["completion_percentage"]) == 40.0
    assert row["is_complete"] is False


async def test_an_invented_section_cannot_move_the_percentage(database, seeded):
    async with database.actor(token_for(LEARNER_ONE)) as connection:
        row = await repository.save_progress(
            connection,
            module_id=seeded["module_id"],
            completed_section_ids=["objective", "not_a_section"],
            last_section_id=None,
        )

    # One of five: the invented identifier counts for nothing.
    assert float(row["completion_percentage"]) == 20.0


async def test_completing_needs_every_section(database, seeded):
    async with database.actor(token_for(LEARNER_ONE)) as connection:
        await repository.save_progress(
            connection,
            module_id=seeded["module_id"],
            completed_section_ids=["objective"],
            last_section_id=None,
        )
        refused = await repository.complete(connection, module_id=seeded["module_id"])

        await repository.save_progress(
            connection,
            module_id=seeded["module_id"],
            completed_section_ids=["objective", "concept", "rule_1", "rule_2", "example_1"],
            last_section_id="example_1",
        )
        accepted = await repository.complete(connection, module_id=seeded["module_id"])

    assert refused is None
    assert accepted is not None
    assert accepted["is_complete"] is True
    assert float(accepted["completion_percentage"]) == 100.0


async def test_one_learners_save_never_reaches_another_learners_row(database, seeded):
    """No application check stands in front of this. The function reads auth.uid()."""
    async with database.actor(token_for(LEARNER_ONE)) as connection:
        await repository.save_progress(
            connection,
            module_id=seeded["module_id"],
            completed_section_ids=["objective", "concept", "rule_1", "rule_2", "example_1"],
            last_section_id=None,
        )
    async with database.actor(token_for(LEARNER_TWO)) as connection:
        second = await repository.save_progress(
            connection,
            module_id=seeded["module_id"],
            completed_section_ids=["objective"],
            last_section_id=None,
        )
        # The second learner reads only their own row back.
        visible = await connection.fetch(
            "select student_id, completion_percentage from app.student_module_progress"
        )

    assert float(second["completion_percentage"]) == 20.0
    assert len(visible) == 1
    assert float(visible[0]["completion_percentage"]) == 20.0

    owner = await asyncpg.connect(DB_URL, statement_cache_size=0)
    try:
        rows = await owner.fetch(
            """
            select completion_percentage
            from app.student_module_progress
            where module_id = $1
            order by completion_percentage
            """,
            seeded["module_id"],
        )
    finally:
        await owner.close()

    assert [float(row["completion_percentage"]) for row in rows] == [20.0, 100.0]
