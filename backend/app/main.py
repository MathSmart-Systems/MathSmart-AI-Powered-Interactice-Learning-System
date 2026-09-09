"""FastAPI entry point.

Everything the application needs is created once at startup and hung on
`app.state`, so a request handler never constructs a database pool or an HTTP
client of its own. The pieces are injectable, which is how the tests run the
whole stack without a database or a network.

Note what is on `app.state` and what the dependencies expose. The elevated
database and the Auth Admin client live here, because something has to own
them, but no shared dependency hands either of them out. Feature code asking
for a connection receives an actor-scoped one under Row Level Security. The one
sanctioned elevated operation reaches them through its own module's dependency,
so the reach of the secret key is visible in the import graph.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI

from app.config import Settings, get_settings
from middleware.errors import install_error_handlers
from middleware.request_context import RequestIdMiddleware
from modules.activities.router import router as activities_router
from modules.assessments.router import router as assessments_router
from modules.auth.router import router as auth_router
from modules.competencies.router import router as competencies_router
from modules.learning_modules.router import router as learning_modules_router
from modules.shared.db import Database
from modules.students.router import router as students_router

API_PREFIX = "/api/v1"


def create_app(
    *,
    settings: Settings | None = None,
    token_verifier: Any | None = None,
    database: Any | None = None,
    session_gateway: Any | None = None,
    elevated_database: Any | None = None,
    auth_admin: Any | None = None,
    groq: Any | None = None,
) -> FastAPI:
    """Build the application.

    Every collaborator can be supplied, which is what lets the tests exercise
    real routing, real dependencies and the real error envelope without a
    database or a network.
    """
    resolved = settings or get_settings()

    @asynccontextmanager
    async def lifespan(application: FastAPI) -> AsyncIterator[None]:
        await application.state.database.connect()
        if application.state.session_gateway is not None:
            await application.state.session_gateway.connect()
        if application.state.elevated_database is not None:
            await application.state.elevated_database.connect()
        try:
            yield
        finally:
            await application.state.database.disconnect()
            if application.state.session_gateway is not None:
                await application.state.session_gateway.disconnect()
            if application.state.elevated_database is not None:
                await application.state.elevated_database.disconnect()

    application = FastAPI(
        title="MathSmart API",
        version="1.2",
        docs_url=f"{API_PREFIX}/docs",
        openapi_url=f"{API_PREFIX}/openapi.json",
        lifespan=lifespan,
    )

    application.state.settings = resolved
    application.state.token_verifier = token_verifier or _default_verifier(resolved)
    application.state.database = database or Database(resolved.supabase_db_url)
    # Answers one question — is this token's session still there — and hands out
    # nothing else. Sensitive routes reach it through require_active_session.
    application.state.session_gateway = (
        session_gateway if session_gateway is not None else _default_session_gateway(resolved)
    )
    # Built here because something has to own them, and nowhere else: no shared
    # dependency hands either out. Only modules/students/provisioning.py imports
    # them, and an architecture test keeps it that way.
    application.state.elevated_database = (
        elevated_database
        if elevated_database is not None
        else _default_elevated_database(resolved)
    )
    application.state.auth_admin = (
        auth_admin if auth_admin is not None else _default_auth_admin(resolved)
    )
    application.state.groq = groq or _default_groq(resolved)

    application.add_middleware(RequestIdMiddleware)
    install_error_handlers(application)

    @application.get(f"{API_PREFIX}/health", tags=["health"])
    async def health() -> dict[str, Any]:
        """Liveness. Deliberately says nothing about configuration or versions."""
        return {"data": {"status": "ok"}}

    application.include_router(auth_router, prefix=API_PREFIX)
    application.include_router(students_router, prefix=API_PREFIX)
    application.include_router(competencies_router, prefix=API_PREFIX)
    application.include_router(learning_modules_router, prefix=API_PREFIX)
    application.include_router(assessments_router, prefix=API_PREFIX)
    application.include_router(activities_router, prefix=API_PREFIX)

    return application


def _default_verifier(settings: Settings) -> Any:
    from middleware.auth import TokenVerifier

    return TokenVerifier(settings)


def _default_session_gateway(settings: Settings) -> Any:
    from modules.shared.session_gateway import SessionGateway

    return SessionGateway(settings.supabase_db_url)


def _default_elevated_database(settings: Settings) -> Any:
    from modules.shared.elevated_db import ElevatedDatabase

    return ElevatedDatabase(settings.supabase_db_url)


def _default_auth_admin(settings: Settings) -> Any:
    from modules.shared.auth_admin import SupabaseAuthAdmin

    return SupabaseAuthAdmin(settings)


def _default_groq(settings: Settings) -> Any:
    from modules.shared.groq_adapter import GroqAdapter

    return GroqAdapter(settings)


app = create_app  # `uvicorn app.main:app --factory`
