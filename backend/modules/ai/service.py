"""The advisory boundary, shared by every feature that may ask Groq something.

The `/ai/*` routes were the only caller for a long time, so the gate, the
adapter lookup and the provenance block lived inside the router as private
helpers. A second caller has now arrived: the interventions module needs the
same advice, generated the same way, but written onto a case rather than
returned to a browser.

Copying those helpers into that module would have produced a second definition
of "is Groq allowed to answer right now", and the first one to drift would have
been the one nobody noticed. So the boundary moved here instead, and both
callers use it. Nothing in this module talks to a browser: it takes a request
(for the adapter and the flags on `app.state`), a purpose, and evidence, and it
either returns an `AdvisoryResult` or raises the one documented 503.

The credential and the model are `.env` values read by the adapter. Nothing
here accepts either from a caller, and nothing returns more than the model name
the documented provenance block asks for.
"""

from __future__ import annotations

import json
from typing import Any
from uuid import UUID

from fastapi import Request

from middleware.errors import ApiError
from modules.ai.schemas import Provenance

#: The single code every advisory failure answers with. Disabled by policy, no
#: credential, a timeout, a rate limit and a reply in an unexpected shape are
#: all the same thing to a caller who already has the deterministic answer.
UNAVAILABLE = "groq_assistance_unavailable"

UNAVAILABLE_MESSAGE = "AI assistance is not available"


def adapter(request: Request) -> Any:
    """The configured Groq adapter, or the documented 503."""
    adviser = request.app.state.groq
    if adviser is None:
        raise ApiError(503, UNAVAILABLE_MESSAGE, code=UNAVAILABLE)
    return adviser


def evidence_from(model: Any) -> dict[str, Any]:
    """A request model as evidence, with identifiers stringified for the prompt.

    The adapter redacts by key before anything leaves the process; this simply
    hands it what the caller assembled.
    """
    evidence = model.model_dump(mode="json", exclude_none=True)
    return {
        key: str(value) if isinstance(value, UUID) else value
        for key, value in evidence.items()
    }


async def is_advisory_enabled(request: Request, actor: Any = None) -> bool:
    """True only when BOTH server GROQ_ENABLED and database features.groq_advisory are true."""
    settings = getattr(request.app.state, "settings", None)
    if not bool(getattr(settings, "groq_enabled", False)):
        return False

    adviser = getattr(request.app.state, "groq", None)
    if adviser is None or not bool(getattr(adviser, "enabled", True)):
        return False

    database = getattr(request.app.state, "database", None)
    if database is None:
        return False

    query = (
        "select setting_value from app.system_settings "
        "where setting_key in ('features.groq_advisory', 'features.groq_enabled') "
        "order by case when setting_key = 'features.groq_advisory' then 1 else 2 end "
        "limit 1"
    )
    try:
        val = None
        if hasattr(database, "_pool") and database._pool is not None:
            async with database._pool.acquire() as conn:
                val = await conn.fetchval(query)
        elif hasattr(database, "actor") and actor is not None:
            async with database.actor(actor) as conn:
                val = await conn.fetchval(query)
        elif hasattr(database, "fetchval"):
            val = await database.fetchval(query)

        if val is None:
            return False

        if isinstance(val, str):
            try:
                val = json.loads(val)
            except (json.JSONDecodeError, TypeError):
                pass

        return bool(val) is True
    except Exception:
        return False


async def request_advice(
    request: Request,
    *,
    purpose: str,
    model: Any,
    actor: Any = None,
    instructions: str | None = None,
    max_tokens: int | None = None,
) -> Any:
    """One advisory answer, or the documented 503. Never a partial state.

    `instructions` and `max_tokens` are how a caller says what shape and size
    of answer it can actually render. Both are optional; the `/ai/*` routes
    leave them out and get the prose contract they have always had.
    """
    if not await is_advisory_enabled(request, actor):
        raise ApiError(503, UNAVAILABLE_MESSAGE, code=UNAVAILABLE)

    adviser = adapter(request)
    result = await adviser.advise(
        purpose=purpose,
        evidence=evidence_from(model),
        instructions=instructions,
        max_tokens=max_tokens,
    )
    if result is None:
        # Disabled, timed out, rate limited, or answering in a shape we did not
        # expect. All the same to the caller, and none of them a failure of the
        # deterministic result they already have.
        raise ApiError(503, UNAVAILABLE_MESSAGE, code=UNAVAILABLE)
    return result


async def try_advice(
    request: Request,
    *,
    purpose: str,
    model: Any,
    actor: Any = None,
    instructions: str | None = None,
    max_tokens: int | None = None,
) -> Any | None:
    """The same question, for a caller that can live without an answer.

    A caller asking for two pieces of advice at once should not lose the one
    that arrived because the other did not. This returns `None` instead of
    raising, and leaves the caller to decide whether nothing at all is a
    failure worth reporting.
    """
    try:
        return await request_advice(
            request,
            purpose=purpose,
            model=model,
            actor=actor,
            instructions=instructions,
            max_tokens=max_tokens,
        )
    except ApiError:
        return None


def provenance_of(result: Any) -> dict[str, Any]:
    """The documented provenance block for one advisory result."""
    return Provenance(
        provider=result.provider,
        model=result.model,
        generated_at=result.generated_at,
        confidence_score=result.confidence,
    ).model_dump(mode="json")
