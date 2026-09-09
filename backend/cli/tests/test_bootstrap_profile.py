"""The administrative profile bootstrap.

Deployment leaves a gap that cannot be closed over HTTP: `POST /students`
provisions a learner and requires a Teacher/Administrator to exist first, so the
very first educator profile has nobody to create it. This command closes that
gap from a terminal, for an Auth account that already exists.

The rules it has to keep are the ones that would otherwise turn a convenience
into a privilege-escalation path:

* the role comes from `app_metadata` and never from `user_metadata`, which a
  user can edit about themselves;
* nothing about a password is accepted, displayed or required;
* the profile rows are written in one transaction, so a half-bootstrapped
  account cannot exist;
* running it again with the same facts changes nothing, and running it again
  with different facts changes nothing either — it refuses;
* every run is audited, with no credential and no email address in the record.
"""

from __future__ import annotations

import re
from contextlib import asynccontextmanager
from uuid import UUID, uuid4

import pytest

from cli import bootstrap_profile
from cli.bootstrap_profile import (
    BootstrapConflict,
    BootstrapRefused,
    bootstrap,
    build_parser,
)

TEACHER_USER = UUID("a0000000-0000-4000-8000-0000000000a1")
LEARNER_USER = UUID("b0000000-0000-4000-8000-000000000001")
GRADE_SIX = UUID("3f0f0000-0000-4000-8000-000000000006")
SECTION = UUID("cc7ef387-7435-4af0-8c50-0a7ce6aa5f5c")

TEACHER_EMAIL = "adviser@mathsmart.dev"
LEARNER_EMAIL = "learner@mathsmart.dev"


class FakeAuthUser:
    def __init__(self, user_id, email, app_metadata, user_metadata=None):
        self.id = user_id
        self.email = email
        self.app_metadata = app_metadata
        self.user_metadata = user_metadata or {}


class FakeAuthAdmin:
    """Looks a user up by email. Knows nothing about passwords."""

    def __init__(self, users=()):
        self.users = list(users)
        self.lookups: list[str] = []

    async def find_user_by_email(self, email: str):
        self.lookups.append(email)
        wanted = email.strip().lower()
        for user in self.users:
            if str(user.email).strip().lower() == wanted:
                return user
        return None


class FakeConnection:
    def __init__(self, results=None):
        self.results = results or {}
        self.calls: list[tuple[str, tuple]] = []

    def _matched(self, query):
        for fragment, result in self.results.items():
            if fragment in query:
                return result
        return None

    async def fetchrow(self, query, *args):
        self.calls.append((query, args))
        return self._matched(query)

    async def fetchval(self, query, *args):
        self.calls.append((query, args))
        return self._matched(query)

    async def execute(self, query, *args):
        self.calls.append((query, args))
        return "OK"

    def queries(self):
        return [query for query, _ in self.calls]

    def wrote(self):
        return [query for query in self.queries() if query.lstrip().lower().startswith("insert")]


class FakeElevated:
    """One audited operation, one transaction, and a record of both."""

    def __init__(self, connection=None):
        self.connection = connection or FakeConnection()
        self.operations: list[dict] = []
        self.rolled_back = False

    @asynccontextmanager
    async def operation(self, **kwargs):
        self.operations.append(kwargs)
        try:
            yield self.connection
        except Exception:
            self.rolled_back = True
            raise


def teacher_admin(**overrides):
    request = {
        "role": "teacher_admin",
        "email": TEACHER_EMAIL,
        "full_name": "Maria Santos",
        "employee_id": "EMP-0001",
        "school_name": "Sample Elementary School",
        "division_name": "Sample Division",
    }
    request.update(overrides)
    return request


def student(**overrides):
    request = {
        "role": "student",
        "email": LEARNER_EMAIL,
        "full_name": "Juan Dela Cruz",
        "learner_id": "stu-2026-001",
        "section_id": None,
        "school_name": None,
    }
    request.update(overrides)
    return request


def auth_admin_with(*users):
    return FakeAuthAdmin(users)


TEACHER_AUTH = FakeAuthUser(TEACHER_USER, TEACHER_EMAIL, {"role": "teacher_admin"})
LEARNER_AUTH = FakeAuthUser(LEARNER_USER, LEARNER_EMAIL, {"role": "student"})

GRADE_QUERY = "from app.grade_levels"
PROFILE_QUERY = "from app.user_profiles"
TEACHER_QUERY = "from app.teacher_admin_profiles"
STUDENT_QUERY = "from app.student_profiles"


def empty_connection():
    return FakeConnection(results={GRADE_QUERY: GRADE_SIX})


# ---------------------------------------------------------------------------
# The happy paths
# ---------------------------------------------------------------------------


async def test_a_teacher_admin_profile_is_created():
    elevated = FakeElevated(empty_connection())

    result = await bootstrap(
        auth_admin=auth_admin_with(TEACHER_AUTH), elevated=elevated, request=teacher_admin()
    )

    assert result.created is True
    assert result.user_id == TEACHER_USER
    assert result.role == "teacher_admin"
    written = " ".join(elevated.connection.wrote()).lower()
    assert "app.user_profiles" in written
    assert "app.teacher_admin_profiles" in written


async def test_a_student_profile_is_created_against_grade_six():
    elevated = FakeElevated(empty_connection())

    result = await bootstrap(
        auth_admin=auth_admin_with(LEARNER_AUTH), elevated=elevated, request=student()
    )

    assert result.created is True
    written = " ".join(elevated.connection.wrote()).lower()
    assert "app.student_profiles" in written
    grade_call = next(call for call in elevated.connection.calls if GRADE_QUERY in call[0])
    assert 6 in grade_call[1]


async def test_a_learner_identifier_is_normalised_before_it_is_stored():
    """The column constraint stores learner ids upper-case; so does this."""
    elevated = FakeElevated(empty_connection())

    await bootstrap(
        auth_admin=auth_admin_with(LEARNER_AUTH), elevated=elevated, request=student()
    )

    arguments = [argument for _, args in elevated.connection.calls for argument in args]
    assert "STU-2026-001" in arguments
    assert "stu-2026-001" not in arguments


async def test_an_email_is_normalised_before_it_is_stored():
    elevated = FakeElevated(empty_connection())

    await bootstrap(
        auth_admin=auth_admin_with(TEACHER_AUTH),
        elevated=elevated,
        request=teacher_admin(email="  Adviser@MathSmart.DEV  "),
    )

    arguments = [argument for _, args in elevated.connection.calls for argument in args]
    assert TEACHER_EMAIL in arguments


async def test_every_value_travels_as_a_bind_parameter():
    """Nothing the operator typed is ever concatenated into the statement."""
    elevated = FakeElevated(empty_connection())

    await bootstrap(
        auth_admin=auth_admin_with(TEACHER_AUTH), elevated=elevated, request=teacher_admin()
    )

    for query, _ in elevated.connection.calls:
        assert "Maria Santos" not in query
        assert "EMP-0001" not in query
        assert TEACHER_EMAIL not in query


# ---------------------------------------------------------------------------
# Authorization
# ---------------------------------------------------------------------------


async def test_an_account_that_does_not_exist_is_refused():
    elevated = FakeElevated(empty_connection())

    with pytest.raises(BootstrapRefused):
        await bootstrap(auth_admin=auth_admin_with(), elevated=elevated, request=teacher_admin())

    assert elevated.operations == []


async def test_a_role_the_account_does_not_carry_is_refused():
    elevated = FakeElevated(empty_connection())

    with pytest.raises(BootstrapRefused):
        await bootstrap(
            auth_admin=auth_admin_with(LEARNER_AUTH),
            elevated=elevated,
            request=teacher_admin(email=LEARNER_EMAIL),
        )

    assert elevated.operations == []


async def test_an_account_with_no_trusted_role_is_refused():
    nameless = FakeAuthUser(TEACHER_USER, TEACHER_EMAIL, {})
    elevated = FakeElevated(empty_connection())

    with pytest.raises(BootstrapRefused):
        await bootstrap(
            auth_admin=auth_admin_with(nameless), elevated=elevated, request=teacher_admin()
        )

    assert elevated.operations == []


async def test_user_metadata_is_never_an_authorization_source():
    """A user can edit their own user_metadata, so a role there means nothing."""
    impostor = FakeAuthUser(
        TEACHER_USER,
        TEACHER_EMAIL,
        {"role": "student"},
        user_metadata={"role": "teacher_admin"},
    )
    elevated = FakeElevated(empty_connection())

    with pytest.raises(BootstrapRefused):
        await bootstrap(
            auth_admin=auth_admin_with(impostor), elevated=elevated, request=teacher_admin()
        )

    assert elevated.operations == []


# ---------------------------------------------------------------------------
# Idempotency and conflict
# ---------------------------------------------------------------------------


def existing_teacher(**overrides):
    profile = {
        "user_id": TEACHER_USER,
        "full_name": "Maria Santos",
        "email": TEACHER_EMAIL,
        "role": "teacher_admin",
    }
    role_row = {
        "teacher_admin_id": uuid4(),
        "user_id": TEACHER_USER,
        "employee_id": "EMP-0001",
        "school_name": "Sample Elementary School",
        "division_name": "Sample Division",
    }
    profile.update(overrides.pop("profile", {}))
    role_row.update(overrides.pop("role_row", {}))
    return FakeConnection(
        results={GRADE_QUERY: GRADE_SIX, PROFILE_QUERY: profile, TEACHER_QUERY: role_row}
    )


async def test_running_it_again_with_the_same_facts_changes_nothing():
    elevated = FakeElevated(existing_teacher())

    result = await bootstrap(
        auth_admin=auth_admin_with(TEACHER_AUTH), elevated=elevated, request=teacher_admin()
    )

    assert result.created is False
    assert elevated.connection.wrote() == []


async def test_a_conflicting_name_is_refused_without_writing():
    elevated = FakeElevated(existing_teacher(profile={"full_name": "Somebody Else"}))

    with pytest.raises(BootstrapConflict):
        await bootstrap(
            auth_admin=auth_admin_with(TEACHER_AUTH), elevated=elevated, request=teacher_admin()
        )

    assert elevated.connection.wrote() == []
    assert elevated.rolled_back is True


async def test_a_conflicting_employee_id_is_refused_without_writing():
    elevated = FakeElevated(existing_teacher(role_row={"employee_id": "EMP-9999"}))

    with pytest.raises(BootstrapConflict):
        await bootstrap(
            auth_admin=auth_admin_with(TEACHER_AUTH), elevated=elevated, request=teacher_admin()
        )

    assert elevated.connection.wrote() == []


async def test_a_profile_that_already_holds_another_role_is_refused():
    """The account is a learner in the application; it does not become an educator."""
    elevated = FakeElevated(existing_teacher(profile={"role": "student"}))

    with pytest.raises(BootstrapConflict):
        await bootstrap(
            auth_admin=auth_admin_with(TEACHER_AUTH), elevated=elevated, request=teacher_admin()
        )

    assert elevated.connection.wrote() == []


def existing_student(**overrides):
    profile = {
        "user_id": LEARNER_USER,
        "full_name": "Juan Dela Cruz",
        "email": LEARNER_EMAIL,
        "role": "student",
    }
    role_row = {
        "student_id": uuid4(),
        "user_id": LEARNER_USER,
        "learner_id": "STU-2026-001",
        "grade_id": GRADE_SIX,
        "section_id": None,
        "school_name": None,
    }
    profile.update(overrides.pop("profile", {}))
    role_row.update(overrides.pop("role_row", {}))
    return FakeConnection(
        results={GRADE_QUERY: GRADE_SIX, PROFILE_QUERY: profile, STUDENT_QUERY: role_row}
    )


async def test_a_rerun_that_omits_the_optional_facts_is_still_a_no_op():
    """Nothing was supplied to disagree with, so the stored blanks stand."""
    elevated = FakeElevated(existing_student())

    result = await bootstrap(
        auth_admin=auth_admin_with(LEARNER_AUTH), elevated=elevated, request=student()
    )

    assert result.created is False
    assert elevated.connection.wrote() == []


async def test_a_section_supplied_against_a_stored_blank_is_refused_without_writing():
    """The command never fills a blank in a row it did not write; it refuses."""
    elevated = FakeElevated(existing_student())

    with pytest.raises(BootstrapConflict):
        await bootstrap(
            auth_admin=auth_admin_with(LEARNER_AUTH),
            elevated=elevated,
            request=student(section_id=SECTION),
        )

    assert elevated.connection.wrote() == []
    assert elevated.rolled_back is True


async def test_a_school_supplied_against_a_stored_blank_is_refused_without_writing():
    elevated = FakeElevated(existing_student())

    with pytest.raises(BootstrapConflict):
        await bootstrap(
            auth_admin=auth_admin_with(LEARNER_AUTH),
            elevated=elevated,
            request=student(school_name="Sample Elementary School"),
        )

    assert elevated.connection.wrote() == []


async def test_a_missing_grade_six_is_refused():
    elevated = FakeElevated(FakeConnection(results={GRADE_QUERY: None}))

    with pytest.raises(BootstrapRefused):
        await bootstrap(
            auth_admin=auth_admin_with(LEARNER_AUTH), elevated=elevated, request=student()
        )

    assert elevated.connection.wrote() == []


# ---------------------------------------------------------------------------
# Audit
# ---------------------------------------------------------------------------


async def test_the_run_is_audited_without_a_credential_or_an_email():
    elevated = FakeElevated(empty_connection())

    await bootstrap(
        auth_admin=auth_admin_with(TEACHER_AUTH), elevated=elevated, request=teacher_admin()
    )

    operation = elevated.operations[0]
    assert operation["action"] == "profile.bootstrapped"
    assert operation["target_type"] == "user_profile"
    assert operation["target_id"] == str(TEACHER_USER)
    recorded = str(operation.get("details", {})).lower()
    for forbidden in ("password", "secret", "token", "@mathsmart"):
        assert forbidden not in recorded


# ---------------------------------------------------------------------------
# The command line
# ---------------------------------------------------------------------------


def test_the_parser_accepts_no_password():
    parser = build_parser()

    with pytest.raises(SystemExit):
        parser.parse_args(
            ["teacher-admin", "--email", TEACHER_EMAIL, "--password", "anything"]
        )


def test_a_teacher_admin_run_requires_the_school_facts():
    parser = build_parser()

    with pytest.raises(SystemExit):
        parser.parse_args(["teacher-admin", "--email", TEACHER_EMAIL, "--full-name", "Maria"])


def test_a_student_run_requires_a_learner_id():
    parser = build_parser()

    with pytest.raises(SystemExit):
        parser.parse_args(["student", "--email", LEARNER_EMAIL, "--full-name", "Juan"])


def test_the_parser_holds_no_default_identity():
    """Nothing about a person is hard-coded: every identifying value is required."""
    parser = build_parser()

    arguments = parser.parse_args(
        [
            "student",
            "--email",
            LEARNER_EMAIL,
            "--full-name",
            "Juan Dela Cruz",
            "--learner-id",
            "STU-2026-001",
        ]
    )

    assert arguments.section_id is None
    assert arguments.grade_level == 6

    # No identity is baked into the command: no email address, no employee id,
    # no learner id, no account identifier.
    with open(bootstrap_profile.__file__, encoding="utf-8") as handle:
        source = handle.read()
    assert not re.search(r"[\w.+-]+@[\w-]+\.[\w.-]+", source)
    assert not re.search(r"(EMP|STU|LRN)-[A-Za-z0-9]", source)
    assert not re.search(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-", source)


def test_a_section_may_be_supplied_for_a_student():
    parser = build_parser()

    arguments = parser.parse_args(
        [
            "student",
            "--email",
            LEARNER_EMAIL,
            "--full-name",
            "Juan Dela Cruz",
            "--learner-id",
            "STU-2026-001",
            "--section-id",
            str(SECTION),
        ]
    )

    assert arguments.section_id == SECTION


# ---------------------------------------------------------------------------
# There is no HTTP way in
# ---------------------------------------------------------------------------


def test_no_route_exposes_the_bootstrap():
    from modules.shared.testing import FakeConnection as RouteFake
    from modules.shared.testing import build_client

    client = build_client(RouteFake())
    paths = client.get("/api/v1/openapi.json").json()["paths"]

    assert not [path for path in paths if "bootstrap" in path or "register" in path]
