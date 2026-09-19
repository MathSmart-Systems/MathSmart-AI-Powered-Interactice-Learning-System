"""Data access for Teacher/Administrator administration.

Curriculum authoring is an ordinary write. The column grants on each table
already state which columns `authenticated` may author — and, for
`app.questions`, that `answer_key`, `explanation` and `hint` may be written but
never read — while RLS states who may author them. So the statements here are
built once, at import, from a fixed description of each resource.

Nothing in a request reaches the statement text. The identifiers come from the
tuples below, every one of which is checked against a strict pattern when this
module loads, and every value travels as a bind parameter.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from modules.shared.db import ActorConnection

_IDENTIFIER = re.compile(r"^[a-z][a-z0-9_]*$")


@dataclass(frozen=True)
class Resource:
    """One administered table, and what may be read and written on it."""

    name: str
    table: str
    key: str
    #: Columns a response may carry. For questions this deliberately excludes
    #: the answer key, which the caller has no privilege to select anyway.
    readable: tuple[str, ...]
    #: Columns a request may author, in the order the statements use them.
    writable: tuple[str, ...]
    order_by: str
    search: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        names = (self.table, self.key, self.order_by, *self.readable, *self.writable, *self.search)
        for identifier in names:
            if not _IDENTIFIER.match(identifier):
                raise ValueError(f"Unsafe identifier in resource {self.name}: {identifier!r}")


COMPETENCIES = Resource(
    name="competencies",
    table="competencies",
    key="competency_id",
    readable=(
        "competency_id", "code", "grade_id", "domain", "name", "description",
        "status", "prerequisite_ids", "created_at", "updated_at",
    ),
    writable=("code", "grade_id", "domain", "name", "description", "status", "prerequisite_ids"),
    order_by="code",
    search=("code", "name"),
)

LEARNING_MODULES = Resource(
    name="modules",
    table="learning_modules",
    key="module_id",
    readable=(
        "module_id", "competency_id", "title", "estimated_minutes", "learning_objective",
        "short_explanation", "rules", "worked_examples", "status", "version",
        "order_index", "created_at", "updated_at",
    ),
    writable=(
        "competency_id", "title", "estimated_minutes", "learning_objective",
        "short_explanation", "rules", "worked_examples", "status", "order_index",
    ),
    order_by="title",
    search=("title",),
)

ACTIVITIES = Resource(
    name="activities",
    table="activities",
    key="activity_id",
    readable=(
        "activity_id", "module_id", "title", "description", "estimated_minutes",
        "points", "mastery_threshold", "status", "version", "created_at", "updated_at",
    ),
    writable=(
        "module_id", "title", "description", "estimated_minutes", "points",
        "mastery_threshold", "status",
    ),
    order_by="title",
    search=("title",),
)

# answer_key, explanation and hint are writable and not readable. That asymmetry
# is the column grant, and it is why authoring works while a response cannot
# disclose a key.
QUESTIONS = Resource(
    name="questions",
    table="questions",
    key="question_id",
    readable=(
        "question_id", "competency_id", "question_type", "difficulty", "prompt",
        "choices", "visual_aid_description", "status", "version", "created_at", "updated_at",
    ),
    writable=(
        "competency_id", "question_type", "difficulty", "prompt", "choices",
        "answer_key", "explanation", "hint", "visual_aid_description", "status",
    ),
    order_by="created_at",
    search=("prompt",),
)

ASSESSMENTS = Resource(
    name="assessments",
    table="assessments",
    key="assessment_id",
    readable=(
        "assessment_id", "grade_id", "title", "assessment_type", "status",
        "duration_minutes", "description", "version", "created_at", "updated_at",
    ),
    writable=("grade_id", "title", "assessment_type", "status", "duration_minutes", "description"),
    order_by="title",
    search=("title",),
)

GRADES = Resource(
    name="grades",
    table="grade_levels",
    key="grade_id",
    readable=("grade_id", "name", "level", "is_active"),
    writable=("name", "level", "is_active"),
    order_by="level",
    search=("name",),
)

SECTIONS = Resource(
    name="sections",
    table="sections",
    key="section_id",
    readable=("section_id", "grade_id", "adviser_id", "name", "is_active", "created_at"),
    writable=("grade_id", "adviser_id", "name", "is_active"),
    order_by="name",
    search=("name",),
)

RESOURCES = {
    resource.name: resource
    for resource in (
        COMPETENCIES, LEARNING_MODULES, ACTIVITIES, QUESTIONS, ASSESSMENTS, GRADES, SECTIONS
    )
}


def _placeholders(count: int, *, start: int = 1) -> str:
    return ", ".join(f"${index}" for index in range(start, start + count))


def _search_clause(resource: Resource) -> str:
    """The optional search filter, over the resource's own text columns."""
    if not resource.search:
        return " and ($1::text is null or true)"
    matches = " or ".join(
        f"{resource.table}.{column} ilike '%' || $1 || '%'" for column in resource.search
    )
    return f" and ($1::text is null or {matches})"


def _status_clause(resource: Resource, placeholder: str) -> str:
    """The optional publication-status filter, where the resource has one.

    A resource without a status column still accepts the parameter, so every
    listing keeps one signature; the clause is then a no-op.
    """
    if "status" not in resource.readable:
        return f" and ({placeholder}::text is null or true)"
    return f" and ({placeholder}::text is null or {resource.table}.status::text = {placeholder})"


def list_sql(resource: Resource) -> str:
    """Generate SQL query for paginated resource listing with search and status filters."""
    columns = ", ".join(f"{resource.table}.{column}" for column in resource.readable)
    return (
        f"select {columns}\nfrom app.{resource.table}\n"
        f"where true{_search_clause(resource)}{_status_clause(resource, '$4')}\n"
        f"order by {resource.table}.{resource.order_by}\nlimit $2 offset $3"
    )


def count_sql(resource: Resource) -> str:
    """Generate SQL query for counting total matching resource rows."""
    return (
        f"select count(*) as total\nfrom app.{resource.table}\n"
        f"where true{_search_clause(resource)}{_status_clause(resource, '$2')}"
    )


def module_list_sql() -> str:
    """The module list, filtered before its page is selected."""
    columns = ", ".join(
        f"{LEARNING_MODULES.table}.{column}" for column in LEARNING_MODULES.readable
    )
    return (
        f"select {columns}\nfrom app.{LEARNING_MODULES.table}\n"
        f"where true{_search_clause(LEARNING_MODULES)}\n"
        f" and ($2::app.publication_status is null or {LEARNING_MODULES.table}.status = $2)\n"
        f"order by {LEARNING_MODULES.table}.{LEARNING_MODULES.order_by}\nlimit $3 offset $4"
    )


def module_count_sql() -> str:
    """The count for the same status-scoped module result set."""
    return (
        f"select count(*) as total\nfrom app.{LEARNING_MODULES.table}\n"
        f"where true{_search_clause(LEARNING_MODULES)}\n"
        f" and ($2::app.publication_status is null or {LEARNING_MODULES.table}.status = $2)"
    )


def read_sql(resource: Resource) -> str:
    columns = ", ".join(f"{resource.table}.{column}" for column in resource.readable)
    return (
        f"select {columns}\nfrom app.{resource.table}\n"
        f"where {resource.table}.{resource.key} = $1"
    )


def insert_sql(resource: Resource, columns: tuple[str, ...]) -> str:
    returning = ", ".join(resource.readable)
    return (
        f"insert into app.{resource.table} ({', '.join(columns)})\n"
        f"values ({_placeholders(len(columns))})\nreturning {returning}"
    )


def update_sql(resource: Resource, columns: tuple[str, ...]) -> str:
    assignments = ", ".join(
        f"{column} = ${index}" for index, column in enumerate(columns, start=2)
    )
    returning = ", ".join(resource.readable)
    return (
        f"update app.{resource.table}\nset {assignments}\n"
        f"where {resource.key} = $1\nreturning {returning}"
    )


def archive_sql(resource: Resource) -> str:
    """Archiving, never deleting: history has to survive a withdrawn draft."""
    return (
        f"update app.{resource.table}\nset status = 'archived'\n"
        f"where {resource.key} = $1\nreturning {resource.key}"
    )


_MODULE_WRITE_STATE_SQL = """
select learning_modules.competency_id, learning_modules.status
from app.learning_modules
where learning_modules.module_id = $1
for update
"""

_PUBLISHED_COMPETENCY_LOCK_SQL = """
select competencies.competency_id
from app.competencies
where competencies.competency_id = $1
  and competencies.status = 'published'
for share
"""


def deactivate_sql(resource: Resource) -> str:
    """Grades and sections have no publication status, so they are deactivated."""
    return (
        f"update app.{resource.table}\nset is_active = false\n"
        f"where {resource.key} = $1\nreturning {resource.key}"
    )


#: A section's adviser is a `teacher_admin_profiles.teacher_admin_id`, which is
#: that profile's own key and not the account's `user_id`. The listing carries
#: both so a caller never has to guess which one a section wants.
_USERS_SQL = """
select
  user_profiles.user_id,
  user_profiles.full_name,
  user_profiles.email,
  user_profiles.role,
  user_profiles.account_status,
  user_profiles.archived_at,
  user_profiles.created_at,
  teacher_admin_profiles.teacher_admin_id
from app.user_profiles
left join app.teacher_admin_profiles
  on teacher_admin_profiles.user_id = user_profiles.user_id
where ($1::app.user_role is null or user_profiles.role = $1)
  and ($2::app.account_status is null or user_profiles.account_status = $2)
  and ($3::text is null
       or user_profiles.full_name ilike '%' || $3 || '%'
       or user_profiles.email ilike '%' || $3 || '%')
order by user_profiles.full_name
limit $4 offset $5
"""

_USERS_COUNT_SQL = """
select count(*) as total
from app.user_profiles
where ($1::app.user_role is null or user_profiles.role = $1)
  and ($2::app.account_status is null or user_profiles.account_status = $2)
  and ($3::text is null
       or user_profiles.full_name ilike '%' || $3 || '%'
       or user_profiles.email ilike '%' || $3 || '%')
"""

_USER_SQL = """
select
  user_profiles.user_id,
  user_profiles.full_name,
  user_profiles.email,
  user_profiles.role,
  user_profiles.account_status,
  user_profiles.archived_at,
  user_profiles.created_at
from app.user_profiles
where user_profiles.user_id = $1
"""

_SETTINGS_SQL = """
select
  system_settings.setting_key,
  system_settings.setting_value,
  system_settings.updated_at
from app.system_settings
order by system_settings.setting_key
"""

_UPSERT_SETTING_SQL = """
insert into app.system_settings (setting_key, setting_value, updated_by)
values ($1, $2::jsonb, $3)
on conflict (setting_key) do update set
  setting_value = excluded.setting_value,
  updated_by = excluded.updated_by
"""

_AUDIT_SQL = """
select
  audit_events.audit_event_id,
  audit_events.actor_user_id,
  audit_events.actor_role,
  audit_events.action,
  audit_events.target_type,
  audit_events.target_id,
  audit_events.request_id,
  audit_events.details,
  audit_events.occurred_at
from app.audit_events
where ($1::text is null or audit_events.action = $1)
  and ($2::uuid is null or audit_events.actor_user_id = $2)
  and ($3::uuid is null or audit_events.target_id = $3)
order by audit_events.occurred_at desc
limit $4 offset $5
"""

_RECORD_AUDIT_SQL = "select app.record_audit_event($1, $2, $3, $4, $5::jsonb)"

_MEMBERSHIP_DELETE_SQL = "delete from app.assessment_questions where assessment_id = $1"

_MEMBERSHIP_INSERT_SQL = """
insert into app.assessment_questions (assessment_id, question_id, position)
select $1, member.question_id, member.position
from unnest($2::uuid[]) with ordinality as member(question_id, position)
"""

#: The ordered membership of one assessment. The authoring client needs the
#: existing order before it can replace it, because the replace is whole-list.
_MEMBERSHIP_IDS_SQL = """
select assessment_questions.question_id
from app.assessment_questions
where assessment_questions.assessment_id = $1
order by assessment_questions.position
"""

#: Membership sizes for a page of assessments, in one round trip. A listing
#: needs the count per row to show whether an assessment can be published.
_MEMBERSHIP_COUNTS_SQL = """
select
  assessment_questions.assessment_id,
  count(*) as question_total
from app.assessment_questions
where assessment_questions.assessment_id = any($1::uuid[])
group by assessment_questions.assessment_id
"""

#: Publication preconditions, gathered in one query so the refusal can name the
#: one that failed. An unpublished question, or an inactive grade, would reach a
#: learner as a broken assessment. duration_minutes needs no check here: the
#: table constrains it to 1..480 and forbids null.
_PUBLICATION_READINESS_SQL = """
select
  assessments.status as assessment_status,
  grade_levels.is_active as grade_is_active,
  (
    select count(*)
    from app.assessment_questions
    where assessment_questions.assessment_id = assessments.assessment_id
  ) as question_total,
  (
    select count(*)
    from app.assessment_questions
    join app.questions using (question_id)
    where assessment_questions.assessment_id = assessments.assessment_id
      and questions.status <> 'published'
  ) as unpublished_total
from app.assessments
join app.grade_levels using (grade_id)
where assessments.assessment_id = $1
"""

_SET_ACCOUNT_STATUS_SQL = "select * from app.set_account_status($1, $2, $3)"
_RESET_DIAGNOSTIC_SQL = "select * from app.reset_diagnostic($1, $2, $3)"


async def listing(
    connection: ActorConnection,
    resource: Resource,
    *,
    search: str | None,
    limit: int,
    offset: int,
    status: str | None = None,
) -> list[Any]:
    """Retrieve a paginated slice of resource rows filtered by search and status."""
    return await connection.fetch(list_sql(resource), search, limit, offset, status)


async def listing_total(
    connection: ActorConnection,
    resource: Resource,
    *,
    search: str | None,
    status: str | None = None,
) -> int:
    """Count the total number of resource rows matching search and status filters."""
    return await connection.fetchval(count_sql(resource), search, status) or 0


async def module_listing(
    connection: ActorConnection,
    *,
    search: str | None,
    status: str | None,
    limit: int,
    offset: int,
) -> list[Any]:
    return await connection.fetch(module_list_sql(), search, status, limit, offset)


async def module_listing_total(
    connection: ActorConnection, *, search: str | None, status: str | None
) -> int:
    return await connection.fetchval(module_count_sql(), search, status) or 0


async def read(connection: ActorConnection, resource: Resource, key: UUID) -> Any:
    return await connection.fetchrow(read_sql(resource), key)


async def module_write_state(connection: ActorConnection, module_id: UUID) -> Any:
    """Lock a module so its effective publication state cannot change mid-write."""
    return await connection.fetchrow(_MODULE_WRITE_STATE_SQL, module_id)


async def lock_published_competency(
    connection: ActorConnection, competency_id: UUID
) -> bool:
    """Lock and confirm the parent competency for a published-module write."""
    return (
        await connection.fetchrow(_PUBLISHED_COMPETENCY_LOCK_SQL, competency_id)
        is not None
    )


async def create(
    connection: ActorConnection, resource: Resource, values: dict[str, Any]
) -> Any:
    columns = tuple(column for column in resource.writable if column in values)
    return await connection.fetchrow(
        insert_sql(resource, columns), *[values[column] for column in columns]
    )


async def update(
    connection: ActorConnection, resource: Resource, key: UUID, values: dict[str, Any]
) -> Any:
    columns = tuple(column for column in resource.writable if column in values)
    if not columns:
        return await read(connection, resource, key)
    return await connection.fetchrow(
        update_sql(resource, columns), key, *[values[column] for column in columns]
    )


async def archive(connection: ActorConnection, resource: Resource, key: UUID) -> Any:
    return await connection.fetchval(archive_sql(resource), key)


async def deactivate(connection: ActorConnection, resource: Resource, key: UUID) -> Any:
    return await connection.fetchval(deactivate_sql(resource), key)


#: The one grade MathSmart teaches. Ordered and limited so a directory that
#: somehow holds two level-6 rows still resolves to one answer rather than
#: failing, and so a retired row is never chosen over a live one.
_MVP_GRADE_SQL = """
select grade_levels.grade_id
from app.grade_levels
where grade_levels.level = $1
order by grade_levels.is_active desc, grade_levels.created_at
limit 1
"""


async def mvp_grade(connection: ActorConnection, level: int) -> Any:
    """The grade every section belongs to, read rather than taken on trust."""
    return await connection.fetchval(_MVP_GRADE_SQL, level)


#: Whether a teacher_admin profile may be given a section to advise. The role
#: and the account status are checked here rather than trusted from the
#: request, because a section outlives the page that created it.
_ADVISER_SQL = """
select teacher_admin_profiles.teacher_admin_id
from app.teacher_admin_profiles
join app.user_profiles
  on user_profiles.user_id = teacher_admin_profiles.user_id
where teacher_admin_profiles.teacher_admin_id = $1
  and user_profiles.role = 'teacher_admin'
  and user_profiles.account_status = 'active'
"""


async def adviser(connection: ActorConnection, teacher_admin_id: UUID) -> Any:
    """The adviser profile behind this id, when it may still advise a section."""
    return await connection.fetchval(_ADVISER_SQL, teacher_admin_id)


async def users(
    connection: ActorConnection,
    *,
    role: str | None,
    account_status: str | None,
    search: str | None,
    limit: int,
    offset: int,
) -> list[Any]:
    return await connection.fetch(_USERS_SQL, role, account_status, search, limit, offset)


async def users_total(
    connection: ActorConnection, *, role: str | None, account_status: str | None, search: str | None
) -> int:
    return await connection.fetchval(_USERS_COUNT_SQL, role, account_status, search) or 0


async def user(connection: ActorConnection, user_id: UUID) -> Any:
    return await connection.fetchrow(_USER_SQL, user_id)


async def set_account_status(
    connection: ActorConnection, *, user_id: UUID, status: str, request_id: str | None
) -> Any:
    return await connection.fetchrow(_SET_ACCOUNT_STATUS_SQL, user_id, status, request_id)


async def settings(connection: ActorConnection) -> list[Any]:
    return await connection.fetch(_SETTINGS_SQL)


async def upsert_setting(
    connection: ActorConnection, *, key: str, value: str, updated_by: UUID
) -> None:
    await connection.execute(_UPSERT_SETTING_SQL, key, value, updated_by)


async def audit_events(
    connection: ActorConnection,
    *,
    action: str | None,
    actor_user_id: UUID | None,
    target_id: UUID | None,
    limit: int,
    offset: int,
) -> list[Any]:
    return await connection.fetch(_AUDIT_SQL, action, actor_user_id, target_id, limit, offset)


async def record_audit_event(
    connection: ActorConnection,
    *,
    action: str,
    target_type: str,
    target_id: UUID | None,
    request_id: str | None,
    details: dict[str, Any] | None = None,
) -> None:
    await connection.execute(
        _RECORD_AUDIT_SQL, action, target_type, target_id, request_id, json.dumps(details or {})
    )


async def replace_assessment_questions(
    connection: ActorConnection, *, assessment_id: UUID, question_ids: list[UUID]
) -> None:
    """Atomically replace the ordered set of questions belonging to an assessment."""
    await connection.execute(_MEMBERSHIP_DELETE_SQL, assessment_id)
    if question_ids:
        await connection.execute(_MEMBERSHIP_INSERT_SQL, assessment_id, question_ids)


async def assessment_question_ids(
    connection: ActorConnection, assessment_id: UUID
) -> list[UUID]:
    """The assessment's questions, in delivery order."""
    rows = await connection.fetch(_MEMBERSHIP_IDS_SQL, assessment_id)
    return [row["question_id"] for row in rows]


async def assessment_question_counts(
    connection: ActorConnection, assessment_ids: list[UUID]
) -> dict[UUID, int]:
    """Membership sizes for a page of assessments. Absent means zero."""
    if not assessment_ids:
        return {}
    rows = await connection.fetch(_MEMBERSHIP_COUNTS_SQL, assessment_ids)
    return {row["assessment_id"]: row["question_total"] for row in rows}


async def assessment_publication_readiness(
    connection: ActorConnection, assessment_id: UUID
) -> Any:
    """Check whether an assessment meets criteria for publication readiness."""
    return await connection.fetchrow(_PUBLICATION_READINESS_SQL, assessment_id)


async def reset_diagnostic(
    connection: ActorConnection, *, student_id: UUID, reason: str, request_id: str | None
) -> Any:
    return await connection.fetchrow(_RESET_DIAGNOSTIC_SQL, student_id, reason, request_id)


def _activity_status_clause(placeholder: str) -> str:
    """Build a SQL clause filtering activities by publication status."""
    return f" and ({placeholder}::text is null or activities.status::text = {placeholder})"


def _activity_module_clause(placeholder: str) -> str:
    """Build a SQL clause filtering activities by parent learning module ID."""
    return f" and ({placeholder}::uuid is null or activities.module_id = {placeholder})"


def list_activities_sql() -> str:
    """Construct a SQL statement to retrieve paginated activity records."""
    columns = ", ".join(f"activities.{column}" for column in ACTIVITIES.readable)
    where = (
        f"where true{_search_clause(ACTIVITIES)}"
        f"{_activity_status_clause('$4')}{_activity_module_clause('$5')}\n"
    )
    return (
        f"select {columns}\nfrom app.activities\n"
        f"{where}"
        f"order by activities.{ACTIVITIES.order_by}\nlimit $2 offset $3"
    )


def count_activities_sql() -> str:
    """Construct a SQL statement to count total matching activity records."""
    where = (
        f"where true{_search_clause(ACTIVITIES)}"
        f"{_activity_status_clause('$2')}{_activity_module_clause('$3')}"
    )
    return f"select count(*) as total\nfrom app.activities\n{where}"


async def list_activities(
    connection: ActorConnection,
    *,
    search: str | None,
    limit: int,
    offset: int,
    status: str | None = None,
    module_id: UUID | None = None,
) -> list[Any]:
    """Fetch paginated activity rows filtered by search, status, and module."""
    return await connection.fetch(
        list_activities_sql(), search, limit, offset, status, module_id
    )


async def count_activities(
    connection: ActorConnection,
    *,
    search: str | None,
    status: str | None = None,
    module_id: UUID | None = None,
) -> int:
    """Count total matching activity records matching search, status, and module."""
    return await connection.fetchval(
        count_activities_sql(), search, status, module_id
    ) or 0
