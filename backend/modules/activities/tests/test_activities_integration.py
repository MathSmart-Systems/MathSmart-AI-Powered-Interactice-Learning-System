"""Activity catalogue readiness against the real policies.

`is_ready` is worked out in the catalogue statement, and the only thing that
makes it hard is the thing it is for. A learner cannot see a draft question, or
one whose competency is a draft, at all — `questions_select` removes it — so a
statement written the obvious way counts what is left, finds it consistent, and
reports a broken activity as ready. That is exactly the failure this column
exists to prevent, and only a real connection as a real learner can show it.

The teacher-admin side of the same question is proved here too, because it is
the same rule read by a caller whose policies do not hide anything.

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
from modules.activities import repository
from modules.shared.db import Database
from modules.teacher_admin import admin_repository

DB_URL = os.environ.get("MATHSMART_TEST_DB_URL")

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(not DB_URL, reason="MATHSMART_TEST_DB_URL is not set"),
]

LEARNER = uuid4()
EDUCATOR = uuid4()
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
async def seeded() -> dict[str, UUID]:
    """A published activity of one published question, and a spare draft one.

    The spare is the whole point of the fixture: a published question under a
    competency that is still a draft is what an activity can be given without
    anything in the workspace saying so.
    """
    owner = await asyncpg.connect(DB_URL, statement_cache_size=0)
    email = f"practice.learner.{EMAIL_SUFFIX}@mathsmart.test"
    educator_email = f"practice.adviser.{EMAIL_SUFFIX}@mathsmart.test"
    competency_id = draft_competency_id = module_id = activity_id = None
    question_id = draft_question_id = None
    try:
        await owner.execute(
            "insert into auth.users (id, email) values ($1, $2), ($3, $4)",
            LEARNER, email, EDUCATOR, educator_email,
        )
        await owner.execute(
            """
            insert into app.user_profiles (user_id, full_name, email, role) values
              ($1, 'Practice Learner', $2, 'student'),
              ($3, 'Practice Adviser', $4, 'teacher_admin')
            """,
            LEARNER, email, EDUCATOR, educator_email,
        )
        await owner.execute(
            """
            insert into app.teacher_admin_profiles
              (user_id, employee_id, school_name, division_name)
            values ($1, $2, 'Sample School', 'Sample Division')
            """,
            EDUCATOR, f"EMP-ACT-{SUFFIX}",
        )
        await owner.execute(
            """
            insert into app.student_profiles (user_id, learner_id, grade_id)
            values ($1, $2, (select grade_id from app.grade_levels where level = 6))
            """,
            LEARNER, f"LRN-ACT-{SUFFIX}",
        )
        competency_ids: list[UUID] = []
        for code, name, status in (
            (f"ACTX-{SUFFIX}", "Practice competency", "published"),
            (f"ACTD-{SUFFIX}", "Unfinished competency", "draft"),
        ):
            competency_ids.append(
                await owner.fetchval(
                    """
                    insert into app.competencies (code, grade_id, domain, name, status)
                    values ($1, (select grade_id from app.grade_levels where level = 6),
                            'Number Sense', $2, $3)
                    returning competency_id
                    """,
                    code, name, status,
                )
            )
        competency_id, draft_competency_id = competency_ids
        module_id = await owner.fetchval(
            """
            insert into app.learning_modules
              (competency_id, title, estimated_minutes, learning_objective,
               short_explanation, status, order_index)
            values ($1, $2, 15, 'Objective.', 'Explanation.', 'published', 1)
            returning module_id
            """,
            competency_id, f"Practice module {SUFFIX}",
        )
        activity_id = await owner.fetchval(
            """
            insert into app.activities
              (module_id, title, description, estimated_minutes, points,
               mastery_threshold, status)
            values ($1, $2, 'Practise the sign rules.', 10, 10, 75, 'published')
            returning activity_id
            """,
            module_id, f"Practice activity {SUFFIX}",
        )
        question_ids: list[UUID] = []
        for owning_competency, prompt in (
            (competency_id, "What is (-9) x (-8)?"),
            (draft_competency_id, "What is (-6) x (-4)?"),
        ):
            question_ids.append(
                await owner.fetchval(
                    """
                    insert into app.questions
                      (competency_id, question_type, prompt, choices, answer_key, status)
                    values ($1, 'number_input', $2, '[]'::jsonb, '"72"'::jsonb, 'published')
                    returning question_id
                    """,
                    owning_competency, prompt,
                )
            )
        question_id, draft_question_id = question_ids
        await owner.execute(
            """
            insert into app.activity_questions (activity_id, question_id, position)
            values ($1, $2, 1)
            """,
            activity_id, question_id,
        )
        yield {
            "activity_id": activity_id,
            "module_id": module_id,
            "competency_id": competency_id,
            "question_id": question_id,
            "draft_question_id": draft_question_id,
            "draft_competency_id": draft_competency_id,
        }
    finally:
        # Reverse dependency order; these foreign keys restrict rather than
        # cascade, so anything left behind refuses the delete above it.
        await owner.execute(
            "delete from app.activity_questions where activity_id = $1", activity_id
        )
        await owner.execute("delete from app.activities where activity_id = $1", activity_id)
        await owner.execute("delete from app.learning_modules where module_id = $1", module_id)
        await owner.execute(
            "delete from app.questions where competency_id = any($1::uuid[])",
            [competency_id, draft_competency_id],
        )
        await owner.execute(
            "delete from app.competencies where competency_id = any($1::uuid[])",
            [competency_id, draft_competency_id],
        )
        await owner.execute(
            "delete from app.teacher_admin_profiles where user_id = $1", EDUCATOR
        )
        await owner.execute(
            "delete from auth.users where id = any($1::uuid[])", [LEARNER, EDUCATOR]
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


async def _as_learner(database, activity_id: UUID):
    async with database.actor(token_for(LEARNER, MathSmartRole.STUDENT)) as connection:
        return await repository.activity(
            connection, user_id=LEARNER, activity_id=activity_id
        )


async def _setup_status(database, activity_id: UUID):
    async with database.actor(
        token_for(EDUCATOR, MathSmartRole.TEACHER_ADMIN)
    ) as connection:
        statuses = await admin_repository.activity_setup_status(connection, [activity_id])
    return statuses[activity_id]


async def test_a_complete_published_activity_is_ready(database, seeded):
    row = await _as_learner(database, seeded["activity_id"])

    assert row["question_count"] == 1
    assert row["is_ready"] is True


async def test_an_activity_with_no_questions_is_not_ready(database, seeded):
    """The state that produced the reported bug on the activity side.

    An activity published with nothing in it delivers nothing, scores the
    submission zero, and feeds that zero into the competency progress that
    opens an intervention.
    """
    owner = await asyncpg.connect(DB_URL, statement_cache_size=0)
    try:
        await owner.execute(
            "delete from app.activity_questions where activity_id = $1",
            seeded["activity_id"],
        )

        row = await _as_learner(database, seeded["activity_id"])
        status = await _setup_status(database, seeded["activity_id"])
    finally:
        await owner.execute(
            """
            insert into app.activity_questions (activity_id, question_id, position)
            values ($1, $2, 1)
            on conflict do nothing
            """,
            seeded["activity_id"], seeded["question_id"],
        )
        await owner.close()

    assert row["question_count"] == 0
    assert row["is_ready"] is False
    assert status.question_count == 0
    assert status.is_ready is False
    assert status.reason == "no_questions"


async def test_a_question_under_a_draft_competency_makes_the_activity_unready(
    database, seeded
):
    """The failure a count of visible questions cannot see.

    Under `questions_select` the learner's connection does not return this
    question at all, so counting what it can see would find one membership row
    and one deliverable question and call the activity ready. The membership
    count is what disagrees, and that is why the statement compares the two.
    """
    owner = await asyncpg.connect(DB_URL, statement_cache_size=0)
    try:
        await owner.execute(
            """
            insert into app.activity_questions (activity_id, question_id, position)
            values ($1, $2, 2)
            """,
            seeded["activity_id"], seeded["draft_question_id"],
        )

        row = await _as_learner(database, seeded["activity_id"])
        status = await _setup_status(database, seeded["activity_id"])

        async with database.actor(
            token_for(LEARNER, MathSmartRole.STUDENT)
        ) as connection:
            visible = await repository.questions_for(connection, seeded["activity_id"])
    finally:
        await owner.execute(
            "delete from app.activity_questions where question_id = $1",
            seeded["draft_question_id"],
        )
        await owner.close()

    # One of the two members is invisible to this learner, which is precisely
    # what would have made a naive count agree with itself.
    assert len(visible) == 1
    assert row["question_count"] == 2
    assert row["is_ready"] is False
    assert status.is_ready is False
    assert status.reason == "draft_competency"


async def test_an_activity_under_a_draft_module_is_not_ready_for_its_teacher(
    database, seeded
):
    """A learner cannot see it at all; the teacher has to be told why.

    `activities_select` requires the module to be published, so the learner's
    catalogue simply does not contain the row. The workspace does, and without
    a reason on it the teacher is left comparing screens.
    """
    owner = await asyncpg.connect(DB_URL, statement_cache_size=0)
    try:
        await owner.execute(
            "update app.learning_modules set status = 'draft' where module_id = $1",
            seeded["module_id"],
        )

        row = await _as_learner(database, seeded["activity_id"])
        status = await _setup_status(database, seeded["activity_id"])
    finally:
        await owner.execute(
            "update app.learning_modules set status = 'published' where module_id = $1",
            seeded["module_id"],
        )
        await owner.close()

    assert row is None
    assert status.is_ready is False
    assert status.reason == "draft_module"


async def test_a_draft_activity_reports_no_missing_dependency(database, seeded):
    """Not ready, and nothing to fix: it has simply not been published yet.

    The reason names a missing dependency. A complete draft has none, and
    saying `no_questions` or `draft_question` about it would send the teacher
    looking for a problem that is not there — the remaining step is the
    decision to publish, which `status` already reports.
    """
    owner = await asyncpg.connect(DB_URL, statement_cache_size=0)
    try:
        await owner.execute(
            "update app.activities set status = 'draft' where activity_id = $1",
            seeded["activity_id"],
        )

        status = await _setup_status(database, seeded["activity_id"])
    finally:
        await owner.execute(
            "update app.activities set status = 'published' where activity_id = $1",
            seeded["activity_id"],
        )
        await owner.close()

    assert status.is_ready is False
    assert status.reason is None
