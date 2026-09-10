"""Request and response contracts for the auth module."""

from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel


class IdentitySummary(BaseModel):
    """The verified identity used to initialise the application shell.

    Derived from the verified token and the caller's own profile. It never
    carries a credential, and never echoes the access token back.
    """

    user_id: UUID
    role: str
    full_name: str | None = None
    email: str | None = None
    account_status: str | None = None
