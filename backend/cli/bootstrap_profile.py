"""Attach an application profile to an Auth account that already exists.

Why this is a command and not an endpoint
-----------------------------------------
`POST /students` provisions a learner and requires a Teacher/Administrator to
already exist. The first educator therefore has nobody to create them, and the
gap cannot be closed over HTTP without inventing a public bootstrap route —
which is exactly the thing MathSmart does not have. So it is a local
administrative command, run by whoever already holds the deployment
credentials, and it is never mounted on the API.

What keeps it safe
------------------
* The role comes from `app_metadata` on the Auth account. `user_metadata` is a
  field a user can edit about themselves, so it is never consulted; the request
  must match the trusted claim exactly or nothing happens.
* No password is accepted, required, printed or logged. This command attaches a
  profile to an identity that already exists; it does not create identities and
  it does not authenticate anyone.
* Nothing about a person is hard-coded. Every identifying value is a required
  argument.
* Both rows are written inside one audited elevated operation, so a
  half-bootstrapped account — a profile with no role row, or the reverse —
  cannot exist.
* Running it again with the same facts writes nothing and reports that. Running
  it again with different facts writes nothing and refuses.
* Every value reaches PostgreSQL as a bind parameter.

The elevated database and the Auth Admin client are imported here and nowhere
else outside their own modules and the one sanctioned provisioning path; an
architecture test keeps that true.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from app.config import Settings, get_settings
from modules.shared.auth_admin import SupabaseAuthAdmin
from modules.shared.elevated_db import ElevatedDatabase

logger = logging.getLogger("mathsmart.bootstrap")

TEACHER_ADMIN = "teacher_admin"
STUDENT = "student"
MVP_GRADE_LEVEL = 6

ACTION = "profile.bootstrapped"
TARGET_TYPE = "user_profile"


class BootstrapRefused(RuntimeError):
    """The account cannot be bootstrapped as asked. Nothing was written."""


class BootstrapConflict(RuntimeError):
    """A profile already exists and says something different. Nothing was written."""


@dataclass(frozen=True)
class BootstrapResult:
    user_id: UUID
    role: str
    created: bool


_GRADE_SQL = """
select grade_levels.grade_id
from app.grade_levels
where grade_levels.level = $1 and grade_levels.is_active
"""

_PROFILE_SQL = """
select
  user_profiles.user_id,
  user_profiles.full_name,
  user_profiles.email,
  user_profiles.role
from app.user_profiles
where user_profiles.user_id = $1
"""

_TEACHER_SQL = """
select
  teacher_admin_profiles.teacher_admin_id,
  teacher_admin_profiles.user_id,
  teacher_admin_profiles.employee_id,
  teacher_admin_profiles.school_name,
  teacher_admin_profiles.division_name
from app.teacher_admin_profiles
where teacher_admin_profiles.user_id = $1
"""

_STUDENT_SQL = """
select
  student_profiles.student_id,
  student_profiles.user_id,
  student_profiles.learner_id,
  student_profiles.grade_id,
  student_profiles.section_id,
  student_profiles.school_name
from app.student_profiles
where student_profiles.user_id = $1
"""

_INSERT_PROFILE_SQL = """
insert into app.user_profiles (user_id, full_name, email, role)
values ($1, $2, $3, $4::app.user_role)
"""

_INSERT_TEACHER_SQL = """
insert into app.teacher_admin_profiles
  (user_id, employee_id, school_name, division_name)
values ($1, $2, $3, $4)
"""

_INSERT_STUDENT_SQL = """
insert into app.student_profiles
  (user_id, learner_id, grade_id, section_id, school_name)
values ($1, $2, $3, $4, $5)
"""


def normalised_email(value: str) -> str:
    """Stored lower-case and trimmed, which is what the column constraint requires."""
    return str(value).strip().lower()


def normalised_learner_id(value: str) -> str:
    """Stored upper-case and trimmed, which is what the column constraint requires."""
    return str(value).strip().upper()


def _trusted_role(user: Any) -> str | None:
    """The role from `app_metadata`, and only from there."""
    metadata = getattr(user, "app_metadata", None) or {}
    role = metadata.get("role")
    return str(role) if role else None


def _disagreement(existing: Any, expected: dict[str, Any]) -> list[str]:
    """Which stored fields differ from what was asked for.

    A stored blank counts as a difference. This command attaches profiles; it
    never edits one it did not write, so a value supplied against a column that
    is already null has to refuse rather than be quietly dropped on the floor
    while the run reports success. The genuine rerun is unaffected: an optional
    value the request did not supply never reaches `expected` at all, so it has
    nothing to disagree with.
    """
    return [
        field
        for field, wanted in expected.items()
        if existing[field] is None or str(existing[field]) != str(wanted)
    ]


async def bootstrap(
    *, auth_admin: Any, elevated: Any, request: dict[str, Any]
) -> BootstrapResult:
    """Attach a profile to an existing Auth account, once."""
    role = str(request["role"])
    email = normalised_email(request["email"])

    user = await auth_admin.find_user_by_email(email)
    if user is None:
        raise BootstrapRefused(
            "No Auth account has that email address. Create the account first."
        )

    trusted = _trusted_role(user)
    if trusted is None:
        raise BootstrapRefused(
            "That Auth account carries no app_metadata.role, so there is no trusted "
            "role to bootstrap. Set it on the account first."
        )
    if trusted != role:
        raise BootstrapRefused(
            f"That Auth account's trusted role is {trusted!r}, not {role!r}. "
            "user_metadata is not consulted."
        )

    async with elevated.operation(
        actor=None,
        action=ACTION,
        target_type=TARGET_TYPE,
        target_id=str(user.id),
        details={"role": role, "requested_by": "administrative cli"},
    ) as connection:
        # Everything that can refuse is resolved before anything is written, so
        # a refusal does not depend on the transaction rolling back.
        grade_id = None
        if role == STUDENT:
            grade_id = await _grade_id(connection)

        created_profile = await _ensure_profile(connection, user.id, request, email, role)
        if role == TEACHER_ADMIN:
            created_role_row = await _ensure_teacher(connection, user.id, request)
        else:
            created_role_row = await _ensure_student(connection, user.id, request, grade_id)

    return BootstrapResult(
        user_id=user.id, role=role, created=created_profile or created_role_row
    )


async def _ensure_profile(
    connection: Any, user_id: UUID, request: dict[str, Any], email: str, role: str
) -> bool:
    expected = {"full_name": str(request["full_name"]), "email": email, "role": role}
    existing = await connection.fetchrow(_PROFILE_SQL, user_id)

    if existing is not None:
        differing = _disagreement(existing, expected)
        if differing:
            raise BootstrapConflict(
                "A profile already exists for that account and differs in: "
                + ", ".join(sorted(differing))
            )
        return False

    await connection.execute(
        _INSERT_PROFILE_SQL, user_id, expected["full_name"], email, role
    )
    return True


async def _ensure_teacher(connection: Any, user_id: UUID, request: dict[str, Any]) -> bool:
    expected = {
        "employee_id": str(request["employee_id"]),
        "school_name": str(request["school_name"]),
        "division_name": str(request["division_name"]),
    }
    existing = await connection.fetchrow(_TEACHER_SQL, user_id)

    if existing is not None:
        differing = _disagreement(existing, expected)
        if differing:
            raise BootstrapConflict(
                "A Teacher/Administrator profile already exists and differs in: "
                + ", ".join(sorted(differing))
            )
        return False

    await connection.execute(
        _INSERT_TEACHER_SQL,
        user_id,
        expected["employee_id"],
        expected["school_name"],
        expected["division_name"],
    )
    return True


async def _grade_id(connection: Any) -> Any:
    grade_id = await connection.fetchval(_GRADE_SQL, MVP_GRADE_LEVEL)
    if grade_id is None:
        raise BootstrapRefused(
            "The MVP grade level is not present or not active. Apply the migrations first."
        )
    return grade_id


async def _ensure_student(
    connection: Any, user_id: UUID, request: dict[str, Any], grade_id: Any
) -> bool:
    learner_id = normalised_learner_id(request["learner_id"])
    section_id = request.get("section_id")
    school_name = request.get("school_name")

    expected: dict[str, Any] = {"learner_id": learner_id, "grade_id": grade_id}
    if section_id is not None:
        expected["section_id"] = section_id
    if school_name is not None:
        expected["school_name"] = school_name

    existing = await connection.fetchrow(_STUDENT_SQL, user_id)
    if existing is not None:
        differing = _disagreement(existing, expected)
        if differing:
            raise BootstrapConflict(
                "A learner profile already exists and differs in: " + ", ".join(sorted(differing))
            )
        return False

    await connection.execute(
        _INSERT_STUDENT_SQL, user_id, learner_id, grade_id, section_id, school_name
    )
    return True


def build_parser() -> argparse.ArgumentParser:
    """The command line. There is deliberately no password option."""
    parser = argparse.ArgumentParser(
        prog="bootstrap-profile",
        description=(
            "Attach a MathSmart profile to a Supabase Auth account that already exists. "
            "The role is taken from the account's trusted app_metadata; no password is "
            "accepted or required."
        ),
    )
    commands = parser.add_subparsers(dest="role", required=True)

    educator = commands.add_parser(
        "teacher-admin", help="attach a Teacher/Administrator profile"
    )
    educator.add_argument("--email", required=True)
    educator.add_argument("--full-name", required=True)
    educator.add_argument("--employee-id", required=True)
    educator.add_argument("--school-name", required=True)
    educator.add_argument("--division-name", required=True)

    learner = commands.add_parser("student", help="attach a learner profile")
    learner.add_argument("--email", required=True)
    learner.add_argument("--full-name", required=True)
    learner.add_argument("--learner-id", required=True)
    learner.add_argument(
        "--grade-level",
        type=int,
        default=MVP_GRADE_LEVEL,
        help="the DepEd grade level; the MVP targets Grade 6",
    )
    learner.add_argument("--section-id", type=UUID, default=None)
    learner.add_argument("--school-name", default=None)

    return parser


def request_from(arguments: argparse.Namespace) -> dict[str, Any]:
    if arguments.role == "teacher-admin":
        return {
            "role": TEACHER_ADMIN,
            "email": arguments.email,
            "full_name": arguments.full_name,
            "employee_id": arguments.employee_id,
            "school_name": arguments.school_name,
            "division_name": arguments.division_name,
        }
    return {
        "role": STUDENT,
        "email": arguments.email,
        "full_name": arguments.full_name,
        "learner_id": arguments.learner_id,
        "section_id": arguments.section_id,
        "school_name": arguments.school_name,
    }


async def _run(settings: Settings, request: dict[str, Any]) -> BootstrapResult:
    auth_admin = SupabaseAuthAdmin(settings)
    elevated = ElevatedDatabase(settings.supabase_db_url)
    await elevated.connect()
    try:
        return await bootstrap(auth_admin=auth_admin, elevated=elevated, request=request)
    finally:
        await elevated.disconnect()


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    arguments = build_parser().parse_args(argv)
    request = request_from(arguments)

    if arguments.role == "student" and arguments.grade_level != MVP_GRADE_LEVEL:
        logger.error("Only Grade %s is supported by the MVP curriculum.", MVP_GRADE_LEVEL)
        return 2

    try:
        result = asyncio.run(_run(get_settings(), request))
    except (BootstrapRefused, BootstrapConflict) as refusal:
        # The message describes the decision, never the values behind it.
        logger.error("%s", refusal)
        return 1

    # Reports the account by its identifier, not by its email address.
    logger.info(
        "%s profile %s for %s",
        result.role,
        "created" if result.created else "already present",
        result.user_id,
    )
    return 0


if __name__ == "__main__":  # pragma: no cover - the entry point itself
    sys.exit(main())
