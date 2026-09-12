"""Validated server environment settings.

Read from the process environment only. There is deliberately no `env_file`:
the deployment is responsible for loading `.env` into the environment, and this
module never opens that file.

Every credential is a `SecretStr`, so it cannot be rendered by accident into a
log line, a traceback, an error response, or a debugger frame. Reading a
credential is always an explicit `.get_secret_value()` call, which is greppable.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic import SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Server-side configuration for the MathSmart backend."""

    model_config = SettingsConfigDict(case_sensitive=False, extra="ignore")

    # Supabase, as the backend sees it.
    supabase_url: str
    supabase_secret_key: SecretStr
    supabase_db_url: SecretStr
    supabase_jwks_url: str
    supabase_jwt_issuer: str
    supabase_jwt_audience: str = "authenticated"

    # Browser origins allowed to call the API. A JSON list; the default matches
    # local development on either localhost spelling, and production sets the
    # deployed frontend origin.
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

    # Groq is advisory. Grading, mastery, progression and intervention triggers
    # are deterministic and must work with this disabled, so the credential and
    # the model are optional until it is switched on.
    groq_enabled: bool = False
    groq_api_key: SecretStr | None = None
    groq_model: str | None = None
    groq_timeout_seconds: float = 8.0

    @model_validator(mode="after")
    def _groq_is_completely_configured_or_off(self) -> Settings:
        if not self.groq_enabled:
            return self
        if self.groq_api_key is None:
            raise ValueError("GROQ_ENABLED is true but GROQ_API_KEY is not set")
        if not self.groq_model:
            raise ValueError("GROQ_ENABLED is true but GROQ_MODEL is not set")
        return self


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """The process-wide settings, resolved once."""
    return Settings()
