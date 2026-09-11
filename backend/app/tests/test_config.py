"""Configuration is the first place a secret can leak, so it is the first thing tested."""

import pytest
from pydantic import ValidationError

from app.config import Settings

BASE_ENV = {
    "SUPABASE_URL": "https://example.supabase.co",
    "SUPABASE_SECRET_KEY": "sb_secret_do_not_render_me",
    "SUPABASE_DB_URL": "postgresql://user:pw@127.0.0.1:5432/postgres",
    "SUPABASE_JWKS_URL": "https://example.supabase.co/auth/v1/.well-known/jwks.json",
    "SUPABASE_JWT_ISSUER": "https://example.supabase.co/auth/v1",
}


def build(monkeypatch, **overrides):
    for key in (
        *BASE_ENV,
        "SUPABASE_JWT_AUDIENCE",
        "GROQ_API_KEY",
        "GROQ_MODEL",
        "GROQ_ENABLED",
        "GROQ_TIMEOUT_SECONDS",
    ):
        monkeypatch.delenv(key, raising=False)
    for key, value in {**BASE_ENV, **overrides}.items():
        monkeypatch.setenv(key, value)
    return Settings()


def test_secret_key_never_renders(monkeypatch):
    settings = build(monkeypatch)

    assert "sb_secret_do_not_render_me" not in repr(settings)
    assert "sb_secret_do_not_render_me" not in str(settings)


def test_database_url_never_renders(monkeypatch):
    settings = build(monkeypatch)

    assert "pw" not in repr(settings.supabase_db_url)
    assert "postgresql://user:pw" not in str(settings)


def test_secret_key_is_readable_deliberately(monkeypatch):
    settings = build(monkeypatch)

    assert settings.supabase_secret_key.get_secret_value() == "sb_secret_do_not_render_me"


def test_groq_is_disabled_by_default_and_needs_no_credential(monkeypatch):
    settings = build(monkeypatch)

    assert settings.groq_enabled is False
    assert settings.groq_api_key is None


def test_enabling_groq_without_a_credential_is_rejected(monkeypatch):
    with pytest.raises(ValidationError):
        build(monkeypatch, GROQ_ENABLED="true", GROQ_MODEL="some-model")


def test_enabling_groq_without_a_model_is_rejected(monkeypatch):
    with pytest.raises(ValidationError):
        build(monkeypatch, GROQ_ENABLED="true", GROQ_API_KEY="gsk_example")


def test_groq_credential_never_renders(monkeypatch):
    settings = build(monkeypatch, GROQ_ENABLED="true", GROQ_API_KEY="gsk_example", GROQ_MODEL="m")

    assert "gsk_example" not in repr(settings)
    assert "gsk_example" not in str(settings)
