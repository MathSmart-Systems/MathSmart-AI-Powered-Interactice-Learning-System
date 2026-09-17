from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, StringConstraints


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
    school_name: str | None = None
    division_name: str | None = None
    employee_id: str | None = None


class OwnProfileChanges(BaseModel):
    """What a user may change about themselves."""

    model_config = ConfigDict(extra="forbid")

    full_name: Annotated[
        str,
        StringConstraints(strip_whitespace=True, min_length=2, max_length=120),
    ]


