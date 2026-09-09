"""Auth routes.

`POST /auth/register` is deliberately absent. MathSmart accounts are
administrator-provisioned, and there is no public registration; learners are
enrolled through `POST /students` by a Teacher/Administrator. The frozen route
documentation still describes a public register endpoint, which is reported as a
documentation mismatch rather than implemented.

Sign-in and token refresh are not proxied here either. The browser talks to
Supabase Auth directly for those, as the existing frontend already does, which
keeps password handling out of this service entirely.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from app.dependencies import ActorDb, CurrentActor
from modules.auth import service

router = APIRouter(tags=["auth"])


@router.get("/auth/me")
async def read_own_identity(actor: CurrentActor, connection: ActorDb) -> dict[str, Any]:
    """The verified identity and profile summary for the caller."""
    identity = await service.identity_for(connection, actor)
    return {"data": identity.model_dump(mode="json")}
