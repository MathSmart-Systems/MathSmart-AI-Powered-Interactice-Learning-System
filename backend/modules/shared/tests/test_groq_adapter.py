"""The Groq adapter is advisory, and everything about it is a failure path.

Every test here asserts one of two things: the deterministic caller keeps
working when Groq does not, or nothing sensitive leaves the process.
"""

from decimal import Decimal

import httpx
import pytest
from pydantic import SecretStr

from app.config import Settings
from modules.shared.groq_adapter import AdvisoryResult, GroqAdapter, redact_evidence

BASE = {
    "supabase_url": "https://example.supabase.co",
    "supabase_secret_key": SecretStr("sb_secret"),
    "supabase_db_url": SecretStr("postgresql://u:p@127.0.0.1:5432/postgres"),
    "supabase_jwks_url": "https://example.supabase.co/auth/v1/.well-known/jwks.json",
    "supabase_jwt_issuer": "https://example.supabase.co/auth/v1",
}

SUCCESS_BODY = {
    "choices": [{"message": {"content": "Try grouping the terms before multiplying."}}],
}


def settings(**overrides) -> Settings:
    return Settings(**{**BASE, **overrides})


def enabled_settings(**overrides) -> Settings:
    return settings(
        groq_enabled=True,
        groq_api_key=SecretStr("gsk_do_not_leak"),
        groq_model="test-model",
        **overrides,
    )


def client_for(handler) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


async def test_disabled_groq_returns_no_advice_and_makes_no_call():
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(200, json=SUCCESS_BODY)

    adapter = GroqAdapter(settings(), client=client_for(handler))

    assert await adapter.advise(purpose="student_feedback", evidence={"score": 40}) is None
    assert calls == []


async def test_enabled_groq_returns_labelled_advice_with_provenance():
    adapter = GroqAdapter(
        enabled_settings(), client=client_for(lambda r: httpx.Response(200, json=SUCCESS_BODY))
    )

    result = await adapter.advise(purpose="student_feedback", evidence={"score": 40})

    assert isinstance(result, AdvisoryResult)
    assert result.text == "Try grouping the terms before multiplying."
    assert result.provider == "groq"
    assert result.model == "test-model"
    assert result.generated_at is not None


async def test_a_timeout_yields_no_advice_rather_than_an_error():
    def handler(request):
        raise httpx.ReadTimeout("too slow", request=request)

    adapter = GroqAdapter(enabled_settings(), client=client_for(handler))

    assert await adapter.advise(purpose="student_feedback", evidence={}) is None


def _status_handler(status):
    return lambda request: httpx.Response(status, json={"error": "nope"})


@pytest.mark.parametrize("status", [400, 401, 429, 500, 503])
async def test_an_unhappy_response_yields_no_advice(status):
    adapter = GroqAdapter(enabled_settings(), client=client_for(_status_handler(status)))

    assert await adapter.advise(purpose="student_feedback", evidence={}) is None


async def test_a_malformed_body_yields_no_advice():
    adapter = GroqAdapter(
        enabled_settings(), client=client_for(lambda r: httpx.Response(200, json={"unexpected": 1}))
    )

    assert await adapter.advise(purpose="student_feedback", evidence={}) is None


async def test_a_transport_failure_yields_no_advice():
    def handler(request):
        raise httpx.ConnectError("no route", request=request)

    adapter = GroqAdapter(enabled_settings(), client=client_for(handler))

    assert await adapter.advise(purpose="student_feedback", evidence={}) is None


async def test_the_credential_is_sent_as_a_header_and_never_returned():
    seen = {}

    def handler(request):
        seen["authorization"] = request.headers.get("authorization")
        seen["body"] = request.content.decode()
        return httpx.Response(200, json=SUCCESS_BODY)

    adapter = GroqAdapter(enabled_settings(), client=client_for(handler))
    result = await adapter.advise(purpose="student_feedback", evidence={"score": 40})

    assert seen["authorization"] == "Bearer gsk_do_not_leak"
    assert "gsk_do_not_leak" not in seen["body"]
    assert "gsk_do_not_leak" not in repr(result)
    assert "gsk_do_not_leak" not in repr(adapter)


async def test_the_prompt_carries_no_identifying_or_secret_evidence():
    seen = {}

    def handler(request):
        seen["body"] = request.content.decode()
        return httpx.Response(200, json=SUCCESS_BODY)

    adapter = GroqAdapter(enabled_settings(), client=client_for(handler))
    await adapter.advise(
        purpose="teacher_insight",
        evidence={
            "full_name": "Maria Santos",
            "email": "maria@example.test",
            "access_token": "tok_123",
            "competency_code": "M6NS-IA-1",
            "current_score": 40,
        },
    )

    assert "Maria Santos" not in seen["body"]
    assert "maria@example.test" not in seen["body"]
    assert "tok_123" not in seen["body"]
    assert "M6NS-IA-1" in seen["body"]


def test_redaction_strips_identity_and_secrets_but_keeps_evidence():
    redacted = redact_evidence(
        {
            "full_name": "Maria Santos",
            "email": "maria@example.test",
            "avatar_url": "https://example.test/a.png",
            "api_key": "gsk_x",
            "password": "hunter2",
            "refresh_token": "tok",
            "competency_code": "M6NS-IA-1",
            "current_score": Decimal("40"),
            "incorrect_patterns": ["subtracts before multiplying"],
        }
    )

    assert set(redacted) == {"competency_code", "current_score", "incorrect_patterns"}


def test_redaction_reaches_into_nested_evidence():
    redacted = redact_evidence({"learner": {"full_name": "Maria", "current_score": 40}})

    assert redacted == {"learner": {"current_score": 40}}
