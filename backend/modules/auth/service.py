"""Auth module policy."""

from __future__ import annotations

from middleware.auth import VerifiedToken
from modules.auth import repository
from modules.auth.schemas import IdentitySummary
from modules.shared.db import ActorConnection


async def identity_for(connection: ActorConnection, actor: VerifiedToken) -> IdentitySummary:
    """The caller's own identity.

    The role is taken from the verified token rather than from the row, because
    the token's `app_metadata` claim is the authorization source; the row is
    read for the display fields.
    """
    row = await repository.own_profile(connection, actor.user_id)
    return IdentitySummary(
        user_id=actor.user_id,
        role=actor.role.value,
        full_name=row["full_name"] if row else None,
        email=row["email"] if row else None,
        account_status=str(row["account_status"]) if row else None,
    )
