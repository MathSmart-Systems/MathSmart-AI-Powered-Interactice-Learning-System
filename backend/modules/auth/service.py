"""Auth module policy."""

from __future__ import annotations

from typing import Any

from middleware.auth import VerifiedToken
from modules.auth import repository
from modules.auth.schemas import IdentitySummary
from modules.shared.db import ActorConnection


def _summary(actor: VerifiedToken, row: Any) -> IdentitySummary:
    return IdentitySummary(
        user_id=actor.user_id,
        role=actor.role.value,
        full_name=row["full_name"] if row and "full_name" in row else None,
        email=row["email"] if row and "email" in row else None,
        account_status=(
            str(row["account_status"])
            if row and "account_status" in row and row["account_status"]
            else None
        ),
        school_name=row["school_name"] if row and "school_name" in row else None,
        division_name=row["division_name"] if row and "division_name" in row else None,
        employee_id=row["employee_id"] if row and "employee_id" in row else None,
    )


async def identity_for(connection: ActorConnection, actor: VerifiedToken) -> IdentitySummary:
    """The caller's own identity.

    The role is taken from the verified token rather than from the row, because
    the token's `app_metadata` claim is the authorization source; the row is
    read for the display fields.
    """
    row = await repository.own_profile(connection, actor.user_id)
    return _summary(actor, row)


async def update_name_for(
    connection: ActorConnection, actor: VerifiedToken, full_name: str
) -> IdentitySummary | None:
    """Updates the caller's own display name and returns the fresh identity."""
    updated = await repository.update_own_name(
        connection, user_id=actor.user_id, full_name=full_name
    )
    if updated is None:
        return None
    row = await repository.own_profile(connection, actor.user_id)
    return _summary(actor, row)

