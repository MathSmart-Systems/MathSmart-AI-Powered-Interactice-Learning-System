"""The server-side Groq adapter.

Groq is advisory. It never decides correctness, a score, a mastery band, an
unlock, an intervention trigger, a role or a permission, and no caller here may
treat its output as authoritative.

The whole surface is therefore one method that returns advice **or nothing**.
Disabled by feature flag, timed out, rate limited, refused, or answering with a
shape we did not expect all produce the same result: `None`, and the caller
falls back to authored deterministic content. Nothing in this module raises into
a request path, so no grade or progress transaction can roll back because Groq
failed.

The credential is read once through `SecretStr.get_secret_value()` when a
request is built, is sent only as an Authorization header, and is never logged,
returned, or included in a prompt. The selected model is deployment
configuration and cannot be supplied by an API request.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

import httpx

from app.config import Settings

logger = logging.getLogger(__name__)

GROQ_CHAT_COMPLETIONS_URL = "https://api.groq.com/openai/v1/chat/completions"

#: Evidence keys that must never reach a prompt. Identity, because the
#: documentation prefers pseudonymous learner references over names, and
#: anything credential-shaped, because a prompt leaves the process.
_FORBIDDEN_EVIDENCE_FRAGMENTS = (
    "name",
    "email",
    "phone",
    "avatar",
    "address",
    "token",
    "secret",
    "password",
    "api_key",
    "apikey",
    "credential",
    "key",
)


def _is_forbidden(key: str) -> bool:
    lowered = key.lower()
    return any(fragment in lowered for fragment in _FORBIDDEN_EVIDENCE_FRAGMENTS)


def _redact_value(value: Any) -> Any:
    """Redact whatever an evidence value turns out to be, at any depth.

    Sequences are walked as well as mappings, because a name inside a list of
    attempts reaches the prompt just as surely as one at the top level. Only
    keys decide anything here; a list of scalars comes back unchanged, and
    strings and bytes are left alone rather than taken apart as sequences.
    """
    if isinstance(value, dict):
        return redact_evidence(value)
    if isinstance(value, list | tuple):
        return [_redact_value(item) for item in value]
    return value


def redact_evidence(evidence: dict[str, Any]) -> dict[str, Any]:
    """Drop identifying and credential-shaped keys, at any depth.

    Deny by key rather than by value: a value-based filter has to guess, and a
    guess that is wrong once sends a learner's name to a third party.
    """
    redacted: dict[str, Any] = {}
    for key, value in evidence.items():
        if _is_forbidden(key):
            continue
        redacted[key] = _redact_value(value)
    return redacted


@dataclass(frozen=True)
class AdvisoryResult:
    """Advisory output, labelled with the provenance the documentation requires."""

    text: str
    provider: str
    model: str
    generated_at: datetime
    confidence: float | None = None


class GroqAdapter:
    """Bounded, feature-flagged access to Groq. Fails to `None`, never upward."""

    def __init__(self, settings: Settings, *, client: httpx.AsyncClient | None = None) -> None:
        self._settings = settings
        self._client = client

    def __repr__(self) -> str:
        # Deliberately says nothing about the credential.
        return f"GroqAdapter(enabled={self._settings.groq_enabled!r})"

    @property
    def enabled(self) -> bool:
        return self._settings.groq_enabled

    async def advise(self, *, purpose: str, evidence: dict[str, Any]) -> AdvisoryResult | None:
        """Ask Groq for advisory text, or return None so the caller uses its own."""
        if not self._settings.groq_enabled:
            return None

        api_key = self._settings.groq_api_key
        model = self._settings.groq_model
        if api_key is None or not model:
            return None

        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": _system_prompt(purpose)},
                {"role": "user", "content": _evidence_prompt(redact_evidence(evidence))},
            ],
        }

        try:
            response = await self._post(payload, api_key.get_secret_value())
        except (httpx.HTTPError, TimeoutError):
            # Deliberately not re-raised. A failure here must never surface as a
            # request failure, because the deterministic result is already correct.
            logger.warning("Groq advisory request failed for purpose %s", purpose, exc_info=False)
            return None

        if response.status_code != httpx.codes.OK:
            logger.warning(
                "Groq advisory request returned %s for purpose %s", response.status_code, purpose
            )
            return None

        text = _extract_text(response)
        if text is None:
            logger.warning("Groq advisory response had an unexpected shape for purpose %s", purpose)
            return None

        return AdvisoryResult(
            text=text,
            provider="groq",
            model=model,
            generated_at=datetime.now(UTC),
        )

    async def _post(self, payload: dict[str, Any], api_key: str) -> httpx.Response:
        headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
        timeout = self._settings.groq_timeout_seconds

        if self._client is not None:
            return await self._client.post(
                GROQ_CHAT_COMPLETIONS_URL, json=payload, headers=headers, timeout=timeout
            )

        async with httpx.AsyncClient(timeout=timeout) as client:
            return await client.post(GROQ_CHAT_COMPLETIONS_URL, json=payload, headers=headers)


def _system_prompt(purpose: str) -> str:
    return (
        "You are an advisory assistant for a Grade 6 mathematics learning system. "
        "Your output is suggestive and is never authoritative: you do not decide "
        "correctness, scores, mastery, progression or permissions. "
        f"Purpose: {purpose}."
    )


def _evidence_prompt(evidence: dict[str, Any]) -> str:
    return f"Evidence: {evidence}"


def _extract_text(response: httpx.Response) -> str | None:
    try:
        body = response.json()
        content = body["choices"][0]["message"]["content"]
    except (ValueError, KeyError, IndexError, TypeError):
        return None
    return content if isinstance(content, str) and content.strip() else None
