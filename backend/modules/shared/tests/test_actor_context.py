"""The actor context is what makes RLS apply to a pooled backend connection.

Ordinary requests must never run as an elevated role. Instead the verified
caller's claims are installed transaction-locally and the session drops to the
`authenticated` Postgres role, so the same policies that protect the Data API
also protect the backend. These tests pin the exact statement and parameters,
because a mistake here is invisible: everything still works, it just works with
RLS switched off.
"""

import json
from uuid import UUID

import pytest

from middleware.auth import MathSmartRole, VerifiedToken
from modules.shared.actor_context import (
    APPLICATION_SCHEMA,
    PG_ROLE_AUTHENTICATED,
    build_actor_context,
)

STUDENT_UUID = "b0000000-0000-4000-8000-000000000001"


def token(mathsmart_role=MathSmartRole.STUDENT, **claim_overrides) -> VerifiedToken:
    claims = {
        "sub": STUDENT_UUID,
        "role": "authenticated",
        "app_metadata": {"role": mathsmart_role.value},
        "session_id": "session-1",
    }
    claims.update(claim_overrides)
    return VerifiedToken(user_id=UUID(STUDENT_UUID), role=mathsmart_role, claims=claims)


def test_the_context_sets_exactly_three_transaction_local_settings():
    context = build_actor_context(token())

    assert context.sql.count("set_config(") == 3
    assert context.sql.count("true)") == 3
    assert len(context.params) == 3


def test_the_role_is_a_bind_parameter_and_never_interpolated():
    context = build_actor_context(token())

    assert "SET LOCAL ROLE" not in context.sql.upper()
    assert PG_ROLE_AUTHENTICATED not in context.sql
    assert PG_ROLE_AUTHENTICATED in context.params


def test_the_search_path_is_the_private_application_schema():
    context = build_actor_context(token())

    assert APPLICATION_SCHEMA in context.params
    assert APPLICATION_SCHEMA == "app"


def test_ordinary_requests_always_drop_to_the_authenticated_role():
    for role in MathSmartRole:
        context = build_actor_context(token(role))

        assert context.params[1] == PG_ROLE_AUTHENTICATED
        assert PG_ROLE_AUTHENTICATED == "authenticated"


def test_the_resolved_role_is_injected_into_the_claims():
    """auth.role() and auth.jwt()->>'role' read the JSON, not the GUC."""
    context = build_actor_context(token())

    assert json.loads(context.params[2])["role"] == PG_ROLE_AUTHENTICATED


def test_a_token_claiming_the_service_role_is_downgraded():
    """A client-supplied Postgres role claim must never survive into the context."""
    context = build_actor_context(
        token(MathSmartRole.TEACHER_ADMIN, role="service_role")
    )
    claims = json.loads(context.params[2])

    assert claims["role"] == PG_ROLE_AUTHENTICATED
    assert "service_role" not in context.params[2]


def test_the_subject_survives_so_auth_uid_resolves():
    context = build_actor_context(token())

    assert json.loads(context.params[2])["sub"] == STUDENT_UUID


def test_the_mathsmart_role_survives_in_app_metadata():
    context = build_actor_context(token(MathSmartRole.TEACHER_ADMIN))

    assert json.loads(context.params[2])["app_metadata"]["role"] == "teacher_admin"


def test_the_singular_legacy_claim_settings_are_never_used():
    """auth.uid() prefers request.jwt.claim.sub; setting it would silently win."""
    context = build_actor_context(token())

    assert "request.jwt.claim.sub" not in context.sql
    assert "request.jwt.claim'" not in context.sql
    assert "request.jwt.claims" in context.sql


def test_the_context_is_transaction_local_everywhere():
    context = build_actor_context(token())

    # `set_config(name, value, is_local => true)` is the function form of
    # SET LOCAL, which Postgres reverts at COMMIT or ROLLBACK.
    assert ", true)" in context.sql
    assert ", false)" not in context.sql


def test_an_anonymous_context_is_refused():
    with pytest.raises(ValueError):
        build_actor_context(None)
