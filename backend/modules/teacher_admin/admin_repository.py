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


#: Every filter the question bank narrows by, as one clause both statements
#: share. The bank is filtered before its page is selected, which is the whole
#: point: a page of ten rows sorted out in the browser can only ever report on
#: those ten, so the counts and the range caption under the list would describe
#: a different set from the one the teacher is looking at.
_QUESTION_FILTERS = (
    " and ($2::app.publication_status is null or questions.status = $2)"
    " and ($3::uuid is null or questions.competency_id = $3)"
    " and ($4::app.question_type is null or questions.question_type = $4)"
    " and ($5::app.question_difficulty is null or questions.difficulty = $5)"
)


#: The question filters again, without the state and renumbered to match. The
#: state cannot narrow a statement whose whole purpose is to count every state.
_QUESTION_STATE_COUNT_FILTERS = (
    " and ($2::uuid is null or questions.competency_id = $2)"
    " and ($3::app.question_type is null or questions.question_type = $3)"
    " and ($4::app.question_difficulty is null or questions.difficulty = $4)"
)


def question_list_sql() -> str:
    """One page of the question bank, filtered first."""
    columns = ", ".join(f"questions.{column}" for column in QUESTIONS.readable)
    return (
        f"select {columns}\nfrom app.questions\n"
        f"where true{_search_clause(QUESTIONS)}{_QUESTION_FILTERS}\n"
        f"order by questions.{QUESTIONS.order_by} desc, questions.question_id\n"
        f"limit $6 offset $7"
    )


def question_count_sql() -> str:
    """The count for the same filtered result set."""
    return (
        f"select count(*) as total\nfrom app.questions\n"
        f"where true{_search_clause(QUESTIONS)}{_QUESTION_FILTERS}"
    )


#: How many rows each publication state holds, under the filters that are not
#: the state itself.
#:
#: The tabs used to badge only the state being looked at, with the count of the
#: page's own result set. A teacher could not see that there were three drafts
#: waiting without opening Drafts, and a state holding nothing looked exactly
#: like a state holding something — the badge simply was not there. All three
#: counts are read here, in one pass, so every tab can say what it holds
#: including when what it holds is nothing.
def status_counts_sql(resource: Resource, filters: str = "") -> str:
    """Draft, published and archived totals for one filtered result set."""
    return (
        "select\n"
        f"  count(*) filter (where {resource.table}.status = 'draft') as draft,\n"
        f"  count(*) filter (where {resource.table}.status = 'published') as published,\n"
        f"  count(*) filter (where {resource.table}.status = 'archived') as archived\n"
        f"from app.{resource.table}\n"
        f"where true{_search_clause(resource)}{filters}"
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

#: A module about to be restored, locked so its place in the learning path
#: cannot be taken between the check and the write.
_MODULE_RESTORE_STATE_SQL = """
select
  learning_modules.competency_id,
  learning_modules.title,
  learning_modules.order_index,
  learning_modules.status as module_status
from app.learning_modules
where learning_modules.module_id = $1
for update
"""

#: Whether a live module already sits at this place in the competency.
#:
#: `learning_modules_competency_order_key` is a partial unique index that
#: exempts archived rows, which is what lets an archived module keep the place
#: it had. The consequence is that archiving frees the slot, something else
#: normally takes it, and restoring the row then violates the index — which
#: reached the teacher as "Another record already uses one of those values" on
#: a control that offered no way to change the order.
_MODULE_ORDER_TAKEN_SQL = """
select learning_modules.module_id
from app.learning_modules
where learning_modules.competency_id = $1
  and learning_modules.order_index = $2
  and learning_modules.status <> 'archived'
  and learning_modules.module_id <> $3
limit 1
"""

#: The first place after the last live module in the competency.
_NEXT_MODULE_ORDER_SQL = """
select coalesce(max(learning_modules.order_index) + 1, 0)
from app.learning_modules
where learning_modules.competency_id = $1
  and learning_modules.status <> 'archived'
"""

#: The stored competency and state of a question, locked, so a publish check
#: reads the row the write is about to change rather than a stale copy. A change
#: that publishes without naming a competency still has to be checked against
#: the one already stored.
_QUESTION_WRITE_STATE_SQL = """
select
  questions.competency_id,
  questions.status as question_status
from app.questions
where questions.question_id = $1
for update
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

#: The question columns an authoring client may see, qualified for a join.
#: Built from the resource so the membership reads cannot drift from the
#: listing — and so the answer key stays out of both by construction.
_QUESTION_COLUMNS = ", ".join(f"questions.{column}" for column in QUESTIONS.readable)

#: The same read for an assessment, and for the same reason.
_ASSESSMENT_MEMBERSHIP_QUESTIONS_SQL = f"""
select {_QUESTION_COLUMNS}, assessment_questions.position
from app.assessment_questions
join app.questions on questions.question_id = assessment_questions.question_id
where assessment_questions.assessment_id = $1
order by assessment_questions.position
"""  # noqa: S608

#: Membership sizes and delivery readiness for a page of assessments, in one
#: round trip. A listing needs the count per row to show whether an assessment
#: can be published, and the readiness to show whether one that says
#: "published" would actually open for a learner.
#:
#: The workspace showed a published assessment as live whatever was inside it,
#: so an empty paper, or one holding a draft question or a question under a
#: draft competency, was indistinguishable from a working one until a learner
#: hit `app.start_assessment_attempt` and was refused. `is_ready` is that
#: function's own condition, stated per row.
#:
#: Driven from `app.assessments` rather than from the membership, so an
#: assessment with nothing in it still comes back — as the unready row it is,
#: rather than as a row the caller has to guess the meaning of its absence for.
#: The joins onto the membership are outer for the same reason.
#: `readiness_reason` names the one thing to fix, because a boolean cannot. A
#: row that says only "not ready" sends the teacher looking through the
#: membership, the bank and the competencies to find out which of them it meant.
#: The counts are gathered in the inner query and read twice in the outer one,
#: which is the whole reason for the nesting: an alias in a select list is not
#: available to its neighbours, and repeating three aggregates in a CASE would
#: leave two places for the same rule to drift.
#:
#: It is null when nothing is missing, which is not the same claim as
#: `is_ready`. A draft assessment that is complete has no missing dependency —
#: the only thing left is the decision to publish it, which `status` already
#: reports — so it reads as ready-to-publish rather than as broken.
_MEMBERSHIP_COUNTS_SQL = """
select
  setup.assessment_id,
  setup.question_total,
  (
    setup.published
    and setup.question_total > 0
    and setup.unpublished_question_total = 0
    and setup.unpublished_competency_total = 0
  ) as is_ready,
  (case
     when setup.question_total = 0 then 'no_questions'
     when setup.unpublished_question_total > 0 then 'draft_question'
     when setup.unpublished_competency_total > 0 then 'draft_competency'
   end) as readiness_reason
from (
  select
    assessments.assessment_id,
    assessments.status = 'published'::app.publication_status as published,
    count(assessment_questions.question_id)::integer as question_total,
    count(*) filter (
      where assessment_questions.question_id is not null
        and questions.status is distinct from 'published'::app.publication_status
    )::integer as unpublished_question_total,
    count(*) filter (
      where assessment_questions.question_id is not null
        and competencies.status is distinct from 'published'::app.publication_status
    )::integer as unpublished_competency_total
  from app.assessments
  left join app.assessment_questions
    on assessment_questions.assessment_id = assessments.assessment_id
  left join app.questions on questions.question_id = assessment_questions.question_id
  left join app.competencies on competencies.competency_id = questions.competency_id
  where assessments.assessment_id = any($1::uuid[])
  group by assessments.assessment_id, assessments.status
) as setup
"""

#: Attempts a learner has open on an assessment.
#:
#: `start_assessment_attempt` both opens and resumes, and it only finds a
#: published assessment. Returning one to draft while somebody is sitting it
#: would lock that learner out of their own half-finished paper, so the
#: unpublish route counts these first.
_ASSESSMENT_OPEN_ATTEMPTS_SQL = """
select count(*)
from app.assessment_attempts
where assessment_attempts.assessment_id = $1
  and assessment_attempts.status = 'in_progress'
"""

#: Publication preconditions, gathered in one query so the refusal can name the
#: one that failed. An unpublished question, or an inactive grade, would reach a
#: learner as a broken assessment. duration_minutes needs no check here: the
#: table constrains it to 1..480 and forbids null.
#:
#: `unpublished_competency_total` counts the questions whose *competency* is not
#: published, which is a different failure from an unpublished question and used
#: to be nobody's check. `app.start_assessment_attempt` requires both — it
#: counts a question as deliverable only when the question and its competency
#: are published — so an assessment whose question sat under a draft competency
#: passed publication here and then refused to open for the learner, with
#: nothing on the teacher's side saying why.
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
  ) as unpublished_total,
  (
    select count(*)
    from app.assessment_questions
    join app.questions using (question_id)
    join app.competencies using (competency_id)
    where assessment_questions.assessment_id = assessments.assessment_id
      and competencies.status <> 'published'
  ) as unpublished_competency_total
from app.assessments
join app.grade_levels using (grade_id)
where assessments.assessment_id = $1
"""

_ACTIVITY_MEMBERSHIP_DELETE_SQL = "delete from app.activity_questions where activity_id = $1"

_ACTIVITY_MEMBERSHIP_INSERT_SQL = """
insert into app.activity_questions (activity_id, question_id, position)
select $1, member.question_id, member.position
from unnest($2::uuid[]) with ordinality as member(question_id, position)
"""

#: The ordered membership of one activity. The authoring client needs the
#: existing order before it can replace it, because the replace is whole-list.
_ACTIVITY_MEMBERSHIP_IDS_SQL = """
select activity_questions.question_id
from app.activity_questions
where activity_questions.activity_id = $1
order by activity_questions.position
"""

#: The questions an activity holds, in order, as the authoring client shows
#: them. Ids alone were not enough: the editor could only name a question it
#: had happened to load a page of the bank for, so a long membership rendered
#: as a list of "this question is not on the current page" while still asking
#: the teacher to reorder it.
#:
#: Answer keys, explanations and hints are absent, here as everywhere: the
#: caller holds no privilege to select them.
_ACTIVITY_MEMBERSHIP_QUESTIONS_SQL = f"""
select {_QUESTION_COLUMNS}, activity_questions.position
from app.activity_questions
join app.questions on questions.question_id = activity_questions.question_id
where activity_questions.activity_id = $1
order by activity_questions.position
"""  # noqa: S608

#: Membership sizes and delivery readiness for a page of activities, in one
#: round trip. A listing needs the count per row to show whether an activity
#: can be published, and the readiness to show whether one that says
#: "published" would actually open for a learner.
#:
#: The same reading as `_MEMBERSHIP_COUNTS_SQL`, with the two conditions an
#: activity has that a paper does not: its module and that module's competency
#: must be published as well, which is what `activities_select` requires before
#: a learner can see it at all. `question_competencies` is the competency each
#: question belongs to, which is a different row from the module's.
#: `draft_module` covers the module's own competency as well as the module. A
#: module whose competency is a draft cannot be published and is hidden from
#: learners by `learning_modules_select` either way, so the place the teacher
#: has to go is the module — naming the competency instead would send them to
#: the wrong screen.
_ACTIVITY_MEMBERSHIP_COUNTS_SQL = """
select
  setup.activity_id,
  setup.question_total,
  (
    setup.published
    and setup.module_published
    and setup.question_total > 0
    and setup.unpublished_question_total = 0
    and setup.unpublished_competency_total = 0
  ) as is_ready,
  (case
     when setup.question_total = 0 then 'no_questions'
     when setup.unpublished_question_total > 0 then 'draft_question'
     when setup.unpublished_competency_total > 0 then 'draft_competency'
     when not setup.module_published then 'draft_module'
   end) as readiness_reason
from (
  select
    activities.activity_id,
    activities.status = 'published'::app.publication_status as published,
    (
      learning_modules.status = 'published'::app.publication_status
      and competencies.status = 'published'::app.publication_status
    ) as module_published,
    count(activity_questions.question_id)::integer as question_total,
    count(*) filter (
      where activity_questions.question_id is not null
        and questions.status is distinct from 'published'::app.publication_status
    )::integer as unpublished_question_total,
    count(*) filter (
      where activity_questions.question_id is not null
        and question_competencies.status
            is distinct from 'published'::app.publication_status
    )::integer as unpublished_competency_total
  from app.activities
  join app.learning_modules on learning_modules.module_id = activities.module_id
  join app.competencies on competencies.competency_id = learning_modules.competency_id
  left join app.activity_questions
    on activity_questions.activity_id = activities.activity_id
  left join app.questions on questions.question_id = activity_questions.question_id
  left join app.competencies as question_competencies
    on question_competencies.competency_id = questions.competency_id
  where activities.activity_id = any($1::uuid[])
  group by
    activities.activity_id, activities.status, learning_modules.status, competencies.status
) as setup
"""

#: Whether an activity has an attempt somebody is part-way through.
#:
#: Replacing the membership of an activity a learner is sitting rewrites what
#: they are being asked while they are answering it. The snapshot taken at the
#: start keeps their grading honest, but the two would then disagree about
#: what the activity is, so authoring waits until the attempt is finished.
_ACTIVITY_OPEN_ATTEMPTS_SQL = """
select count(*)
from app.activity_attempts
where activity_attempts.activity_id = $1
  and activity_attempts.status = 'in_progress'
"""

#: Publication preconditions, gathered in one query so the refusal can name the
#: one that failed. An activity reaches a learner only when its module and that
#: module's competency are published too — `activities_select` says so — and an
#: activity with no questions, or with a draft one in it, would be delivered
#: empty or short.
#:
#: `competency_status` is the *module's* competency, which is not the competency
#: a question belongs to: a question may be authored under any competency, so an
#: activity whose module is published can still hold a question whose own
#: competency is a draft. `app.start_activity_attempt` counts a question as
#: deliverable only when the question and that question's competency are both
#: published, so `unpublished_competency_total` is the condition that was missing
#: between this check and the one the learner actually meets.
_ACTIVITY_PUBLICATION_READINESS_SQL = """
select
  activities.status as activity_status,
  learning_modules.status as module_status,
  competencies.status as competency_status,
  (
    select count(*)
    from app.activity_questions
    where activity_questions.activity_id = activities.activity_id
  ) as question_total,
  (
    select count(*)
    from app.activity_questions
    join app.questions using (question_id)
    where activity_questions.activity_id = activities.activity_id
      and questions.status <> 'published'
  ) as unpublished_total,
  (
    select count(*)
    from app.activity_questions
    join app.questions using (question_id)
    join app.competencies as question_competencies
      on question_competencies.competency_id = questions.competency_id
    where activity_questions.activity_id = activities.activity_id
      and question_competencies.status <> 'published'
  ) as unpublished_competency_total
from app.activities
join app.learning_modules using (module_id)
join app.competencies using (competency_id)
where activities.activity_id = $1
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


async def question_listing(
    connection: ActorConnection,
    *,
    search: str | None,
    status: str | None,
    competency_id: UUID | None,
    question_type: str | None,
    difficulty: str | None,
    limit: int,
    offset: int,
) -> list[Any]:
    return await connection.fetch(
        question_list_sql(),
        search,
        status,
        competency_id,
        question_type,
        difficulty,
        limit,
        offset,
    )


async def question_listing_total(
    connection: ActorConnection,
    *,
    search: str | None,
    status: str | None,
    competency_id: UUID | None,
    question_type: str | None,
    difficulty: str | None,
) -> int:
    return (
        await connection.fetchval(
            question_count_sql(), search, status, competency_id, question_type, difficulty
        )
        or 0
    )


async def question_status_counts(
    connection: ActorConnection,
    *,
    search: str | None,
    competency_id: UUID | None,
    question_type: str | None,
    difficulty: str | None,
) -> Any:
    """What each publication state holds, under everything except the state."""
    return await connection.fetchrow(
        status_counts_sql(QUESTIONS, _QUESTION_STATE_COUNT_FILTERS),
        search,
        competency_id,
        question_type,
        difficulty,
    )


async def module_status_counts(connection: ActorConnection, *, search: str | None) -> Any:
    return await connection.fetchrow(status_counts_sql(LEARNING_MODULES), search)


async def assessment_status_counts(connection: ActorConnection, *, search: str | None) -> Any:
    return await connection.fetchrow(status_counts_sql(ASSESSMENTS), search)


async def question_write_state(connection: ActorConnection, question_id: UUID) -> Any:
    """Lock a question so its competency cannot change under a publish check."""
    return await connection.fetchrow(_QUESTION_WRITE_STATE_SQL, question_id)


async def module_restore_state(connection: ActorConnection, module_id: UUID) -> Any:
    """Lock a module so its place cannot be taken while a restore decides."""
    return await connection.fetchrow(_MODULE_RESTORE_STATE_SQL, module_id)


async def module_order_is_taken(
    connection: ActorConnection, *, competency_id: UUID, order_index: int, module_id: UUID
) -> bool:
    """Whether a live sibling already occupies this place in the competency."""
    return (
        await connection.fetchval(
            _MODULE_ORDER_TAKEN_SQL, competency_id, order_index, module_id
        )
        is not None
    )


async def next_module_order(connection: ActorConnection, competency_id: UUID) -> int:
    """The first free place after the competency's last live module."""
    value = await connection.fetchval(_NEXT_MODULE_ORDER_SQL, competency_id)
    return int(value or 0)


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


#: How many learners still point at a section. A section with any is not
#: removable, and PostgreSQL would refuse it anyway; asking first is what lets
#: the refusal say which section and how many.
_SECTION_LEARNERS_SQL = """
select count(*) as total
from app.student_profiles
where student_profiles.section_id = $1
"""

#: Everything that would be orphaned by removing a competency.
#:
#: One statement, counted per table, so a refusal can say what is actually in
#: the way instead of "this is in use". Read before the delete is attempted —
#: not because the count is the protection, but because it is the explanation.
#: The protection is the seven ON DELETE RESTRICT foreign keys, which refuse
#: the statement whatever this returns.
_COMPETENCY_REFERENCES_SQL = """
select
  (select count(*) from app.questions
     where questions.competency_id = $1) as questions,
  (select count(*) from app.learning_modules
     where learning_modules.competency_id = $1) as learning_modules,
  (select count(*) from app.competency_progress
     where competency_progress.competency_id = $1) as competency_progress,
  (select count(*) from app.competency_results
     where competency_results.competency_id = $1) as competency_results,
  (select count(*) from app.learning_path_items
     where learning_path_items.competency_id = $1) as learning_path_items,
  (select count(*) from app.interventions
     where interventions.competency_id = $1) as interventions,
  (select count(*) from app.assessment_responses
     where assessment_responses.delivered_competency_id = $1) as delivered_questions
"""

#: The competency a delete or a warning is about, with the one column that
#: decides whether removal is even in scope.
_COMPETENCY_STATE_SQL = """
select competencies.competency_id, competencies.code, competencies.status
from app.competencies
where competencies.competency_id = $1
"""

_DELETE_COMPETENCY_SQL = """
delete from app.competencies
where competencies.competency_id = $1
returning competencies.competency_id
"""


#: Everything that would be orphaned by removing one authored record.
#:
#: One statement per kind, counted per table, so a refusal can say what is
#: actually in the way instead of "this is in use". Read before the delete is
#: attempted — not because the count is the protection, but because it is the
#: explanation. The protection is the ON DELETE RESTRICT foreign keys, which
#: refuse the statement whatever these return.
#:
#: Membership is counted too, even though it cascades. A teacher about to
#: remove a question needs to know it is seated in three activities; a teacher
#: about to remove an activity needs to know the membership rows go with it and
#: the questions do not.
_QUESTION_REFERENCES_SQL = """
select
  (select count(*) from app.assessment_questions
     where assessment_questions.question_id = $1) as assessment_questions,
  (select count(*) from app.activity_questions
     where activity_questions.question_id = $1) as activity_questions,
  (select count(*) from app.assessment_responses
     where assessment_responses.question_id = $1) as assessment_responses,
  (select count(*) from app.activity_responses
     where activity_responses.question_id = $1) as activity_responses
"""

_MODULE_REFERENCES_SQL = """
select
  (select count(*) from app.activities
     where activities.module_id = $1) as activities,
  (select count(*) from app.learning_path_items
     where learning_path_items.module_id = $1) as learning_path_items,
  (select count(*) from app.student_module_progress
     where student_module_progress.module_id = $1) as student_module_progress
"""

_ACTIVITY_REFERENCES_SQL = """
select
  (select count(*) from app.activity_attempts
     where activity_attempts.activity_id = $1) as activity_attempts,
  (select count(*) from app.activity_questions
     where activity_questions.activity_id = $1) as activity_questions
"""

_ASSESSMENT_REFERENCES_SQL = """
select
  (select count(*) from app.assessment_attempts
     where assessment_attempts.assessment_id = $1) as assessment_attempts,
  (select count(*) from app.reassessment_authorizations
     where reassessment_authorizations.assessment_id = $1) as reassessment_authorizations,
  (select count(*) from app.assessment_questions
     where assessment_questions.assessment_id = $1) as assessment_questions
"""

#: The record a delete or a preview is about, locked, with the one column that
#: decides whether removal is even in scope and the one a teacher reads.
#:
#: The lock is what closes the gap between the count and the delete. Both run
#: inside the request's own transaction, so a reference added in between would
#: be refused by the foreign key anyway — but it would arrive as a constraint
#: violation rather than as the sentence naming what is holding it.
_QUESTION_DELETE_STATE_SQL = """
select questions.question_id, questions.prompt as label, questions.status
from app.questions
where questions.question_id = $1
for update
"""

_MODULE_DELETE_STATE_SQL = """
select learning_modules.module_id, learning_modules.title as label, learning_modules.status
from app.learning_modules
where learning_modules.module_id = $1
for update
"""

_ACTIVITY_DELETE_STATE_SQL = """
select activities.activity_id, activities.title as label, activities.status
from app.activities
where activities.activity_id = $1
for update
"""

_ASSESSMENT_DELETE_STATE_SQL = """
select assessments.assessment_id, assessments.title as label, assessments.status
from app.assessments
where assessments.assessment_id = $1
for update
"""

_DELETE_QUESTION_SQL = """
delete from app.questions
where questions.question_id = $1
returning questions.question_id
"""

_DELETE_MODULE_SQL = """
delete from app.learning_modules
where learning_modules.module_id = $1
returning learning_modules.module_id
"""

_DELETE_ACTIVITY_SQL = """
delete from app.activities
where activities.activity_id = $1
returning activities.activity_id
"""

_DELETE_ASSESSMENT_SQL = """
delete from app.assessments
where assessments.assessment_id = $1
returning assessments.assessment_id
"""


@dataclass(frozen=True)
class Deletable:
    """One kind of authored content, and how removal is decided for it.

    Held together rather than written four times, because the four differ only
    in which statements they run and which of their references are disposable
    membership rather than something worth refusing over.
    """

    #: What the record is called in a sentence a teacher reads.
    noun: str
    #: The audit action recorded when one is removed.
    action: str
    #: The audit target type.
    target_type: str
    state_sql: str
    references_sql: str
    delete_sql: str
    #: Reference counts that cascade with the record and must not refuse it.
    disposable: frozenset[str]


QUESTION_DELETION = Deletable(
    noun="question",
    action="question.deleted",
    target_type="question",
    state_sql=_QUESTION_DELETE_STATE_SQL,
    references_sql=_QUESTION_REFERENCES_SQL,
    delete_sql=_DELETE_QUESTION_SQL,
    disposable=frozenset(),
)

MODULE_DELETION = Deletable(
    noun="learning module",
    action="learning_module.deleted",
    target_type="learning_module",
    state_sql=_MODULE_DELETE_STATE_SQL,
    references_sql=_MODULE_REFERENCES_SQL,
    delete_sql=_DELETE_MODULE_SQL,
    disposable=frozenset(),
)

ACTIVITY_DELETION = Deletable(
    noun="activity",
    action="activity.deleted",
    target_type="activity",
    state_sql=_ACTIVITY_DELETE_STATE_SQL,
    references_sql=_ACTIVITY_REFERENCES_SQL,
    delete_sql=_DELETE_ACTIVITY_SQL,
    # Membership says "this activity contains this question". It has no meaning
    # once the activity is gone, and the question it names is held by its own
    # RESTRICT, so removing an unused activity can never reach a reusable
    # question.
    disposable=frozenset({"activity_questions"}),
)

ASSESSMENT_DELETION = Deletable(
    noun="assessment",
    action="assessment.deleted",
    target_type="assessment",
    state_sql=_ASSESSMENT_DELETE_STATE_SQL,
    references_sql=_ASSESSMENT_REFERENCES_SQL,
    delete_sql=_DELETE_ASSESSMENT_SQL,
    disposable=frozenset({"assessment_questions"}),
)


async def deletion_state(connection: ActorConnection, kind: Deletable, key: UUID) -> Any:
    """Lock the record, and read the status that decides whether it may go."""
    return await connection.fetchrow(kind.state_sql, key)


async def deletion_references(connection: ActorConnection, kind: Deletable, key: UUID) -> Any:
    """How many rows in each table still point at this record."""
    return await connection.fetchrow(kind.references_sql, key)


async def delete_record(connection: ActorConnection, kind: Deletable, key: UUID) -> Any:
    """Remove the row outright. Refused by the policy unless archived, and by
    the foreign keys unless unused."""
    return await connection.fetchrow(kind.delete_sql, key)


_DELETE_SECTION_SQL = """
delete from app.sections
where sections.section_id = $1
returning sections.section_id
"""


async def competency_references(connection: ActorConnection, competency_id: UUID) -> Any:
    """How many rows in each table still point at this competency."""
    return await connection.fetchrow(_COMPETENCY_REFERENCES_SQL, competency_id)


async def competency_state(connection: ActorConnection, competency_id: UUID) -> Any:
    """The competency's own code and publication status, or None."""
    return await connection.fetchrow(_COMPETENCY_STATE_SQL, competency_id)


async def delete_competency(connection: ActorConnection, competency_id: UUID) -> Any:
    """Remove a competency outright. Refused by the policy unless archived, and
    by the foreign keys unless unused."""
    return await connection.fetchrow(_DELETE_COMPETENCY_SQL, competency_id)


async def section_learner_count(connection: ActorConnection, section_id: UUID) -> int:
    return await connection.fetchval(_SECTION_LEARNERS_SQL, section_id) or 0


async def delete_section(connection: ActorConnection, section_id: UUID) -> Any:
    """Removes the row outright. The policy allows this only once retired."""
    return await connection.fetchval(_DELETE_SECTION_SQL, section_id)


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


@dataclass(frozen=True)
class SetupStatus:
    """What a workspace row can say about whether a record would deliver.

    Three answers rather than one, because a teacher looking at "not ready"
    still has to find out which of the membership, the question bank, the
    competencies or the module it meant.
    """

    question_count: int
    is_ready: bool
    #: The one missing dependency to name, or None when nothing is missing.
    #: None is not the same claim as `is_ready`: a complete draft has nothing
    #: missing and is simply not published yet, which `status` already says.
    reason: str | None


#: What a record with no row of its own is: nothing in it, and nothing to
#: deliver. Only reachable for an identifier that has since been removed, since
#: both statements are driven from the table the page was read from.
MISSING_SETUP = SetupStatus(question_count=0, is_ready=False, reason="no_questions")


def _setup_status(row: Any) -> SetupStatus:
    return SetupStatus(
        question_count=int(row["question_total"] or 0),
        is_ready=bool(row["is_ready"]),
        reason=row["readiness_reason"],
    )


async def assessment_setup_status(
    connection: ActorConnection, assessment_ids: list[UUID]
) -> dict[UUID, SetupStatus]:
    """Membership size, delivery readiness and the reason, per assessment.

    Keyed by assessment so a caller pairs the answers with the row they belong
    to rather than with the one next to it.
    """
    if not assessment_ids:
        return {}
    rows = await connection.fetch(_MEMBERSHIP_COUNTS_SQL, assessment_ids)
    return {row["assessment_id"]: _setup_status(row) for row in rows}


async def assessment_publication_readiness(
    connection: ActorConnection, assessment_id: UUID
) -> Any:
    """Check whether an assessment meets criteria for publication readiness."""
    return await connection.fetchrow(_PUBLICATION_READINESS_SQL, assessment_id)


async def replace_activity_questions(
    connection: ActorConnection, *, activity_id: UUID, question_ids: list[UUID]
) -> None:
    """Atomically replace the ordered set of questions belonging to an activity."""
    await connection.execute(_ACTIVITY_MEMBERSHIP_DELETE_SQL, activity_id)
    if question_ids:
        await connection.execute(_ACTIVITY_MEMBERSHIP_INSERT_SQL, activity_id, question_ids)


async def activity_question_ids(connection: ActorConnection, activity_id: UUID) -> list[UUID]:
    """The activity's questions, in the order a learner meets them."""
    rows = await connection.fetch(_ACTIVITY_MEMBERSHIP_IDS_SQL, activity_id)
    return [row["question_id"] for row in rows]


async def activity_membership_questions(
    connection: ActorConnection, activity_id: UUID
) -> list[Any]:
    """The activity's questions themselves, in the order a learner meets them."""
    return await connection.fetch(_ACTIVITY_MEMBERSHIP_QUESTIONS_SQL, activity_id)


async def assessment_membership_questions(
    connection: ActorConnection, assessment_id: UUID
) -> list[Any]:
    """The assessment's questions themselves, in delivery order."""
    return await connection.fetch(_ASSESSMENT_MEMBERSHIP_QUESTIONS_SQL, assessment_id)


async def activity_setup_status(
    connection: ActorConnection, activity_ids: list[UUID]
) -> dict[UUID, SetupStatus]:
    """Membership size, delivery readiness and the reason, per activity.

    The same shape and the same reading as `assessment_setup_status`, with the
    one reason an activity can have that a paper cannot: a module that is still
    a draft.
    """
    if not activity_ids:
        return {}
    rows = await connection.fetch(_ACTIVITY_MEMBERSHIP_COUNTS_SQL, activity_ids)
    return {row["activity_id"]: _setup_status(row) for row in rows}


async def activity_open_attempts(connection: ActorConnection, activity_id: UUID) -> int:
    """How many learners are part-way through this activity right now."""
    return await connection.fetchval(_ACTIVITY_OPEN_ATTEMPTS_SQL, activity_id) or 0


async def assessment_open_attempts(connection: ActorConnection, assessment_id: UUID) -> int:
    """How many learners are part-way through this assessment right now."""
    return await connection.fetchval(_ASSESSMENT_OPEN_ATTEMPTS_SQL, assessment_id) or 0


async def activity_publication_readiness(
    connection: ActorConnection, activity_id: UUID
) -> Any:
    """Whether an activity is safe to put in front of a learner."""
    return await connection.fetchrow(_ACTIVITY_PUBLICATION_READINESS_SQL, activity_id)


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
