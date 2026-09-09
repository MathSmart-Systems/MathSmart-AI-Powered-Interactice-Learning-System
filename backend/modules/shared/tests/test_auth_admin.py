"""The Supabase Auth Admin client.

The only component that holds the secret key. It is used for account
provisioning and for undoing an account it created moments earlier, and for
nothing else.
"""

import httpx
import pytest
from pydantic import SecretStr

from app.config import Settings
from modules.shared.auth_admin import (
    AuthAdminError,
    AuthAdminUser,
    EmailAlreadyRegistered,
    SupabaseAuthAdmin,
)

SECRET = "sb_secret_do_not_leak"
USER_ID = "b0000000-0000-4000-8000-000000000001"

CREATED_USER = {
    "id": USER_ID,
    "email": "learner@mathsmart.test",
    "app_metadata": {"role": "student"},
}


def settings() -> Settings:
    return Settings(
        supabase_url="https://example.supabase.co",
        supabase_secret_key=SecretStr(SECRET),
        supabase_db_url=SecretStr("postgresql://u:p@127.0.0.1:5432/postgres"),
        supabase_jwks_url="https://example.supabase.co/auth/v1/.well-known/jwks.json",
        supabase_jwt_issuer="https://example.supabase.co/auth/v1",
    )


def admin_for(handler) -> SupabaseAuthAdmin:
    return SupabaseAuthAdmin(
        settings(), client=httpx.AsyncClient(transport=httpx.MockTransport(handler))
    )


async def test_creating_a_user_posts_to_the_admin_endpoint():
    seen = {}

    def handler(request):
        seen["method"] = request.method
        seen["url"] = str(request.url)
        return httpx.Response(200, json=CREATED_USER)

    await admin_for(handler).create_user(
        email="learner@mathsmart.test", app_metadata={"role": "student"}
    )

    assert seen["method"] == "POST"
    assert seen["url"] == "https://example.supabase.co/auth/v1/admin/users"


async def test_the_secret_key_authenticates_the_call_in_both_required_headers():
    seen = {}

    def handler(request):
        seen["apikey"] = request.headers.get("apikey")
        seen["authorization"] = request.headers.get("authorization")
        return httpx.Response(200, json=CREATED_USER)

    await admin_for(handler).create_user(
        email="learner@mathsmart.test", app_metadata={"role": "student"}
    )

    assert seen["apikey"] == SECRET
    assert seen["authorization"] == f"Bearer {SECRET}"


async def test_the_trusted_role_is_sent_as_app_metadata():
    seen = {}

    def handler(request):
        seen["body"] = request.read().decode()
        return httpx.Response(200, json=CREATED_USER)

    await admin_for(handler).create_user(
        email="learner@mathsmart.test", app_metadata={"role": "student"}
    )

    assert '"app_metadata"' in seen["body"]
    assert '"role"' in seen["body"]
    assert '"student"' in seen["body"]
    # Never user_metadata: a user can edit that, so a role there grants nothing.
    assert "user_metadata" not in seen["body"]


async def test_a_created_user_is_returned_with_its_identifier():
    created = await admin_for(lambda r: httpx.Response(200, json=CREATED_USER)).create_user(
        email="learner@mathsmart.test", app_metadata={"role": "student"}
    )

    assert isinstance(created, AuthAdminUser)
    assert str(created.id) == USER_ID
    assert created.email == "learner@mathsmart.test"


async def test_an_already_registered_email_is_reported_distinctly():
    """A pre-existing Auth account must never be modified or deleted."""

    def handler(request):
        return httpx.Response(
            422, json={"msg": "User already registered", "error_code": "email_exists"}
        )

    with pytest.raises(EmailAlreadyRegistered):
        await admin_for(handler).create_user(
            email="learner@mathsmart.test", app_metadata={"role": "student"}
        )


async def test_another_failure_is_reported_without_the_secret():
    def handler(request):
        return httpx.Response(500, json={"msg": "boom"})

    with pytest.raises(AuthAdminError) as raised:
        await admin_for(handler).create_user(
            email="learner@mathsmart.test", app_metadata={"role": "student"}
        )

    assert SECRET not in str(raised.value)


async def test_a_transport_failure_is_reported_without_the_secret():
    def handler(request):
        raise httpx.ConnectError("no route", request=request)

    with pytest.raises(AuthAdminError) as raised:
        await admin_for(handler).create_user(
            email="learner@mathsmart.test", app_metadata={"role": "student"}
        )

    assert SECRET not in str(raised.value)


async def test_deleting_a_user_targets_that_user():
    seen = {}

    def handler(request):
        seen["method"] = request.method
        seen["url"] = str(request.url)
        return httpx.Response(200, json=CREATED_USER)

    await admin_for(handler).delete_user(USER_ID)

    assert seen["method"] == "DELETE"
    assert seen["url"] == f"https://example.supabase.co/auth/v1/admin/users/{USER_ID}"


async def test_the_client_never_renders_the_secret():
    admin = admin_for(lambda r: httpx.Response(200, json=CREATED_USER))

    assert SECRET not in repr(admin)
    assert SECRET not in str(admin)
