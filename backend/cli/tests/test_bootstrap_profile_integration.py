"""The bootstrap against a real PostgreSQL.

The unit tests fix the decisions. These prove the part only the database can:
that both rows land together, that the constraints accept what the command
writes, that a second run writes nothing, and that a conflicting run leaves the
stored profile exactly as it was.

The Auth service is faked here — the accounts are the deployment's, not the test
suite's — but every write goes through the real elevated path and the real
schema.

Requires a live PostgreSQL with the MathSmart migrations applied. Set
MATHSMART_TEST_DB_URL to run them; they are skipped otherwise.
"""

from __future__ import annotations

import os
from uuid import UUID, uuid4

import asyncpg
import pytest
from pydantic import SecretStr

from cli.bootstrap_profile import BootstrapConflict, BootstrapRefused, bootstrap
from modules.shared.elevated_db import ElevatedDatabase

DB_URL = os.environ.get("MATHSMART_TEST_DB_URL")

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(not DB_URL, reason="MATHSMART_TEST_DB_URL is not set"),
]

TEACHER_USER = uuid4()
LEARNER_USER = uuid4()
SUFFIX = uuid4().hex[:8]
TEACHER_EMAIL = f"bootstrap.adviser.{SUFFIX}@mathsmart.test"
LEARNER_EMAIL = f"bootstrap.learner.{SUFFIX}@mathsmart.test"


class FakeAuthUser:
    def __init__(self, user_id, email, app_metadata):
        self.id = user_id
        self.email = email
        self.app_metadata = app_metadata


class FakeAuthAdmin:
    def __init__(self, users):
        self.users = list(users)

    async def find_user_by_email(self, email: str):
        wanted = email.strip().lower()
        for user in self.users:
            if str(user.email).strip().lower() == wanted:
                return user
        return None


AUTH = FakeAuthAdmin(
    [
        FakeAuthUser(TEACHER_USER, TEACHER_EMAIL, {"role": "teacher_admin"}),
        FakeAuthUser(LEARNER_USER, LEARNER_EMAIL, {"role": "student"}),
    ]
)


def teacher_request(**overrides):
    request = {
        "role": "teacher_admin",
        "email": TEACHER_EMAIL,
        "full_name": "Bootstrap Adviser",
        "employee_id": f"EMP-{SUFFIX.upper()}",
        "school_name": "Sample Elementary School",
        "division_name": "Sample Division",
    }
    request.update(overrides)
    return request


def learner_request(**overrides):
    request = {
        "role": "student",
        "email": LEARNER_EMAIL,
        "full_name": "Bootstrap Learner",
        "learner_id": f"lrn-{SUFFIX}",
        "section_id": None,
        "school_name": None,
    }
    request.update(overrides)
    return request


@pytest.fixture
async def auth_users() -> None:
    """Only the Auth rows; the profiles are what the command is here to create."""
    owner = await asyncpg.connect(DB_URL, statement_cache_size=0)
    try:
        await owner.execute(
            "insert into auth.users (id, email) values ($1, $2), ($3, $4)",
            TEACHER_USER, TEACHER_EMAIL, LEARNER_USER, LEARNER_EMAIL,
        )
        yield
    finally:
        await owner.execute(
            "delete from app.audit_events where target_id = any($1::uuid[])",
            [TEACHER_USER, LEARNER_USER],
        )
        await owner.execute(
            "delete from app.student_profiles where user_id = any($1::uuid[])",
            [TEACHER_USER, LEARNER_USER],
        )
        await owner.execute(
            "delete from app.teacher_admin_profiles where user_id = any($1::uuid[])",
            [TEACHER_USER, LEARNER_USER],
        )
        await owner.execute(
            "delete from app.user_profiles where user_id = any($1::uuid[])",
            [TEACHER_USER, LEARNER_USER],
        )
        await owner.execute(
            "delete from auth.users where id = any($1::uuid[])", [TEACHER_USER, LEARNER_USER]
        )
        await owner.close()


@pytest.fixture
async def elevated() -> ElevatedDatabase:
    database = ElevatedDatabase(SecretStr(DB_URL))
    await database.connect()
    try:
        yield database
    finally:
        await database.disconnect()


async def rows_for(user_id: UUID) -> dict[str, int]:
    owner = await asyncpg.connect(DB_URL, statement_cache_size=0)
    try:
        return {
            "profiles": await owner.fetchval(
                "select count(*) from app.user_profiles where user_id = $1", user_id
            ),
            "teachers": await owner.fetchval(
                "select count(*) from app.teacher_admin_profiles where user_id = $1", user_id
            ),
            "students": await owner.fetchval(
                "select count(*) from app.student_profiles where user_id = $1", user_id
            ),
        }
    finally:
        await owner.close()


async def test_a_teacher_admin_is_bootstrapped_with_both_rows(elevated, auth_users):
    result = await bootstrap(auth_admin=AUTH, elevated=elevated, request=teacher_request())

    assert result.created is True
    counts = await rows_for(TEACHER_USER)
    assert counts["profiles"] == 1
    assert counts["teachers"] == 1


async def test_a_learner_is_bootstrapped_against_grade_six(elevated, auth_users):
    result = await bootstrap(auth_admin=AUTH, elevated=elevated, request=learner_request())

    assert result.created is True
    owner = await asyncpg.connect(DB_URL, statement_cache_size=0)
    try:
        row = await owner.fetchrow(
            """
            select student_profiles.learner_id, grade_levels.level
            from app.student_profiles
            join app.grade_levels on grade_levels.grade_id = student_profiles.grade_id
            where student_profiles.user_id = $1
            """,
            LEARNER_USER,
        )
    finally:
        await owner.close()

    assert row["level"] == 6
    # Stored normalised, which is what the column constraint requires.
    assert row["learner_id"] == f"LRN-{SUFFIX}".upper()


async def test_running_it_again_writes_nothing(elevated, auth_users):
    await bootstrap(auth_admin=AUTH, elevated=elevated, request=teacher_request())
    result = await bootstrap(auth_admin=AUTH, elevated=elevated, request=teacher_request())

    assert result.created is False
    counts = await rows_for(TEACHER_USER)
    assert counts["profiles"] == 1
    assert counts["teachers"] == 1


async def test_a_conflicting_run_changes_nothing(elevated, auth_users):
    await bootstrap(auth_admin=AUTH, elevated=elevated, request=teacher_request())

    with pytest.raises(BootstrapConflict):
        await bootstrap(
            auth_admin=AUTH,
            elevated=elevated,
            request=teacher_request(employee_id="EMP-SOMETHING-ELSE"),
        )

    owner = await asyncpg.connect(DB_URL, statement_cache_size=0)
    try:
        stored = await owner.fetchval(
            "select employee_id from app.teacher_admin_profiles where user_id = $1",
            TEACHER_USER,
        )
    finally:
        await owner.close()

    assert stored == f"EMP-{SUFFIX.upper()}"


async def test_a_role_the_account_does_not_carry_writes_nothing(elevated, auth_users):
    with pytest.raises(BootstrapRefused):
        await bootstrap(
            auth_admin=AUTH,
            elevated=elevated,
            request=teacher_request(email=LEARNER_EMAIL),
        )

    counts = await rows_for(LEARNER_USER)
    assert counts == {"profiles": 0, "teachers": 0, "students": 0}


async def test_the_run_is_audited(elevated, auth_users):
    await bootstrap(auth_admin=AUTH, elevated=elevated, request=teacher_request())

    owner = await asyncpg.connect(DB_URL, statement_cache_size=0)
    try:
        row = await owner.fetchrow(
            """
            select audit_events.action, audit_events.details::text as details
            from app.audit_events
            where audit_events.target_id = $1
            order by audit_events.occurred_at desc
            limit 1
            """,
            TEACHER_USER,
        )
    finally:
        await owner.close()

    assert row["action"] == "profile.bootstrapped"
    # The audit trail records the decision, not the person.
    assert TEACHER_EMAIL not in row["details"]
    assert "password" not in row["details"].lower()


async def test_a_partial_bootstrap_cannot_survive(elevated, auth_users):
    """The role row is written in the same transaction as the profile.

    A learner id the column constraint rejects fails *after* the profile insert
    has already run, so if the two were not one transaction this would leave a
    profile with no learner record behind it.
    """
    with pytest.raises(asyncpg.PostgresError):
        await bootstrap(
            auth_admin=AUTH,
            elevated=elevated,
            request=learner_request(learner_id="L" * 64),
        )

    counts = await rows_for(LEARNER_USER)
    assert counts == {"profiles": 0, "teachers": 0, "students": 0}
