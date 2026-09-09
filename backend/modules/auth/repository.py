"""Data access for the auth module.

Reads through the caller's own actor-scoped connection, so the profile it
returns is the one Row Level Security is willing to show that caller.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from modules.shared.db import ActorConnection

_OWN_PROFILE_SQL = """
select user_id, full_name, email, role, account_status
from app.user_profiles
where user_id = $1
"""


async def own_profile(connection: ActorConnection, user_id: UUID) -> Any:
    return await connection.fetchrow(_OWN_PROFILE_SQL, user_id)
