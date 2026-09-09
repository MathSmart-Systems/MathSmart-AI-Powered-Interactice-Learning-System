"""Recording a case, through the connection the API actually uses.

The unit tests answer with fakes, and a fake will return whatever it is given —
which is how a response built from columns the statement never selected passed
CI and returned 500 in front of a real database. These run the real statements:
the SECURITY DEFINER function that writes the case, and the read-back that the
response is built from.

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
from modules.interventions import repository
from modules.shared.db import Database

DB_URL = os.environ.get("MATHSMART_TEST_DB_URL")

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(not DB_URL, reason="MATHSMART_TEST_DB_URL is not set"),
]

EDUCATOR = uuid4()
OTHER_EDUCATOR = uuid4()
LEARNER = uuid4()
SUFFIX = uuid4().hex[:8].upper()
EDUCATOR_NAME = "Case Adviser"


def token_for(user_id: UUID, role: MathSmartRole) -> VerifiedToken:
    claim = "teacher_admin" if role is MathSmartRole.TEACHER_ADMIN else "student"
    return VerifiedToken(
        user_id=user_id,
        role=role,
        claims={
            "sub": str(user_id),
            "aud": "authenticated",
            "app_metadata": {"role": claim},
        },
    )


@pytest.fixture
async def seeded() -> dict[str, UUID]:
    """Two educators, one learner, one competency."""
    owner = await asyncpg.connect(DB_URL, statement_cache_size=0)
    emails = {
        EDUCATOR: f"case.adviser.{SUFFIX.lower()}@mathsmart.test",
        OTHER_EDUCATOR: f"case.adviser.two.{SUFFIX.lower()}@mathsmart.test",
        LEARNER: f"case.learner.{SUFFIX.lower()}@mathsmart.test",
    }
    competency_id = None
    try:
        for user_id, email in emails.items():
            await owner.execute(
                "insert into auth.users (id, email) values ($1, $2)", user_id, email
            )
        await owner.execute(
            """
            insert into app.user_profiles (user_id, full_name, email, role) values
              ($1, $2, $3, 'teacher_admin'),
              ($4, 'Other Adviser', $5, 'teacher_admin'),
              ($6, 'Case Learner', $7, 'student')
            """,
            EDUCATOR, EDUCATOR_NAME, emails[EDUCATOR],
            OTHER_EDUCATOR, emails[OTHER_EDUCATOR],
            LEARNER, emails[LEARNER],
        )
        educator_id = await owner.fetchval(
            """
            insert into app.teacher_admin_profiles
              (user_id, employee_id, school_name, division_name)
            values ($1, $2, 'Sample School', 'Sample Division')
            returning teacher_admin_id
            """,
            EDUCATOR, f"EMP-C{SUFFIX}",
        )
        other_educator_id = await owner.fetchval(
            """
            insert into app.teacher_admin_profiles
              (user_id, employee_id, school_name, division_name)
            values ($1, $2, 'Sample School', 'Sample Division')
            returning teacher_admin_id
            """,
            OTHER_EDUCATOR, f"EMP-D{SUFFIX}",
        )
        student_id = await owner.fetchval(
            """
            insert into app.student_profiles (user_id, learner_id, grade_id)
            values ($1, $2, (select grade_id from app.grade_levels where level = 6))
            returning student_id
            """,
            LEARNER, f"LRN-C-{SUFFIX}",
        )
        competency_id = await owner.fetchval(
            """
            insert into app.competencies (code, grade_id, domain, name, status)
            values ($1, (select grade_id from app.grade_levels where level = 6),
                    'Number Sense', 'Case competency', 'published')
            returning competency_id
            """,
            f"CASE-{SUFFIX}",
        )
        yield {
            "educator_id": educator_id,
            "other_educator_id": other_educator_id,
            "student_id": student_id,
            "competency_id": competency_id,
        }
    finally:
        await owner.execute(
            "delete from app.interventions where competency_id = $1", competency_id
        )
        await owner.execute(
            "delete from app.audit_events where actor_user_id = any($1::uuid[])",
            list(emails),
        )
        await owner.execute(
            "delete from app.competencies where competency_id = $1", competency_id
        )
        await owner.execute(
            "delete from app.student_profiles where user_id = $1", LEARNER
        )
        await owner.execute(
            "delete from app.teacher_admin_profiles where user_id = any($1::uuid[])",
            [EDUCATOR, OTHER_EDUCATOR],
        )
        await owner.execute(
            "delete from auth.users where id = any($1::uuid[])", list(emails)
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


async def test_recording_a_case_answers_with_the_educator_who_recorded_it(
    database, seeded
):
    """The response's own shape, from the real statements.

    `select * from app.open_intervention(...)` returns an app.interventions row,
    which carries no educator name; the route answers with one. Reading the case
    back is what makes that possible, and this fails without it.
    """
    async with database.actor(token_for(EDUCATOR, MathSmartRole.TEACHER_ADMIN)) as conn:
        row = await repository.record(
            conn,
            student_id=seeded["student_id"],
            competency_id=seeded["competency_id"],
            severity="MEDIUM",
            intervention_type="Additional Exercise",
            educator_notes="Recorded by the integration suite.",
            request_id=None,
        )

    assert row is not None
    assert row["recorded_by"] == EDUCATOR_NAME
    assert str(row["status"]) == "In Progress"
    assert row["teacher_admin_id"] == seeded["educator_id"]
    # The columns the response needs, which the write statement cannot return.
    for column in ("learner_id", "full_name", "competency_code", "competency_name"):
        assert row[column] is not None


async def test_a_case_is_attributed_to_the_caller_not_to_the_named_educator(
    database, seeded
):
    """The educator comes from the token, and the table refuses anything else."""
    async with database.actor(token_for(EDUCATOR, MathSmartRole.TEACHER_ADMIN)) as conn:
        row = await repository.record(
            conn,
            student_id=seeded["student_id"],
            competency_id=seeded["competency_id"],
            severity="LOW",
            intervention_type="Additional Exercise",
            educator_notes="Recorded by the integration suite.",
            request_id=None,
        )
        assert row["teacher_admin_id"] == seeded["educator_id"]

        # The same caller, writing the table directly, naming somebody else.
        with pytest.raises(asyncpg.InsufficientPrivilegeError):
            await conn.execute(
                """
                insert into app.interventions
                  (student_id, teacher_admin_id, competency_id, severity,
                   intervention_type, educator_notes)
                values ($1, $2, $3, 'LOW', 'Additional Exercise', 'Not mine to sign')
                """,
                seeded["student_id"], seeded["other_educator_id"], seeded["competency_id"],
            )


async def test_updating_a_case_answers_with_the_same_shape(database, seeded):
    async with database.actor(token_for(EDUCATOR, MathSmartRole.TEACHER_ADMIN)) as conn:
        opened = await repository.record(
            conn,
            student_id=seeded["student_id"],
            competency_id=seeded["competency_id"],
            severity="HIGH",
            intervention_type="Additional Exercise",
            educator_notes="Recorded by the integration suite.",
            request_id=None,
        )
        updated = await repository.update(
            conn,
            intervention_id=opened["intervention_id"],
            severity=None,
            intervention_type=None,
            educator_notes="Followed up.",
            status="Resolved",
            reopen_reason=None,
            request_id=None,
        )

    assert updated is not None
    assert str(updated["status"]) == "Resolved"
    assert updated["recorded_by"] == EDUCATOR_NAME
    assert updated["educator_notes"] == "Followed up."
