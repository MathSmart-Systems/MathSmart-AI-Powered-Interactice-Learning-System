"""Data access for the auth module.

Reads through the caller's own actor-scoped connection, so the profile it
returns is the one Row Level Security is willing to show that caller.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from modules.shared.db import ActorConnection

_OWN_PROFILE_SQL = """
select
  u.user_id,
  u.full_name,
  u.email,
  u.role,
  u.account_status,
  t.school_name,
  t.division_name,
  t.employee_id
from app.user_profiles u
left join app.teacher_admin_profiles t on t.user_id = u.user_id
where u.user_id = $1
"""

_UPDATE_OWN_NAME_SQL = """
update app.user_profiles
set full_name = $2
where user_id = $1
returning user_id
"""


async def own_profile(connection: ActorConnection, user_id: UUID) -> Any:
    return await connection.fetchrow(_OWN_PROFILE_SQL, user_id)


async def update_own_name(connection: ActorConnection, *, user_id: UUID, full_name: str) -> Any:
    return await connection.fetchrow(_UPDATE_OWN_NAME_SQL, user_id, full_name)
