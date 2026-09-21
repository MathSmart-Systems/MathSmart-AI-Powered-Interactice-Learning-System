"""The Vercel function in `api/index.py`, imported the way Vercel imports it.

It must export a real application built from the environment, serve the
existing `/api/v1/...` routes at their original paths, and leave the factory
that `npm run dev` runs untouched.
"""

import importlib.util
import sys
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.config import get_settings

ENTRYPOINT = Path(__file__).resolve().parents[3] / "api" / "index.py"

ENVIRONMENT = {
    "SUPABASE_URL": "https://example.supabase.co",
    "SUPABASE_SECRET_KEY": "sb_secret_placeholder",
    "SUPABASE_DB_URL": "postgresql://u:p@127.0.0.1:6543/postgres",
    "SUPABASE_JWKS_URL": "https://example.supabase.co/auth/v1/.well-known/jwks.json",
    "SUPABASE_JWT_ISSUER": "https://example.supabase.co/auth/v1",
}


def _load():
    spec = importlib.util.spec_from_file_location("vercel_api_index", ENTRYPOINT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def entrypoint(monkeypatch):
    for key, value in ENVIRONMENT.items():
        monkeypatch.setenv(key, value)
    for key in ("GROQ_ENABLED", "GROQ_API_KEY", "GROQ_MODEL"):
        monkeypatch.delenv(key, raising=False)
    get_settings.cache_clear()
    yield _load()
    sys.modules.pop("vercel_api_index", None)
    get_settings.cache_clear()


def test_the_function_exports_an_application_instance(entrypoint):
    assert isinstance(entrypoint.app, FastAPI)


def test_the_original_api_path_reaches_fastapi(entrypoint):
    """Vercel rewrites /api/v1/* to this function and keeps the path it was asked for."""
    client = TestClient(entrypoint.app, raise_server_exceptions=False)

    health = client.get("/api/v1/health")
    assert health.status_code == 200
    assert health.json() == {"data": {"status": "ok"}}

    # A protected route answers with its own 401, not a 404: the path matched.
    assert client.get("/api/v1/auth/me").status_code == 401
    # The function's own filesystem path is not an API route.
    assert client.get("/api/index").status_code == 404


def test_local_development_still_gets_the_factory():
    from app.main import app, create_app

    assert app is create_app


def test_a_deployment_missing_its_environment_fails_at_import(monkeypatch):
    for key in ENVIRONMENT:
        monkeypatch.delenv(key, raising=False)
    get_settings.cache_clear()
    try:
        with pytest.raises(Exception, match="supabase_url"):
            _load()
    finally:
        sys.modules.pop("vercel_api_index", None)
        get_settings.cache_clear()


def _pins(path: Path) -> list[str]:
    lines = path.read_text(encoding="utf-8").splitlines()
    return sorted(line.strip() for line in lines if line.strip() and not line.startswith("#"))


def test_the_deployment_installs_exactly_the_backend_pins():
    root = Path(__file__).resolve().parents[3]
    assert _pins(root / "requirements.txt") == _pins(root / "backend" / "requirements.txt")
