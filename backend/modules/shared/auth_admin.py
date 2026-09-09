"""The Supabase Auth Admin client.

The only component in the backend that holds the secret key, and the only one
that talks to the Auth service with administrative authority. It provisions an
account and, if the surrounding database work then fails, removes the account it
has just created. Nothing else.

Two rules are load-bearing.

The role is set through `app_metadata`, never `user_metadata`. A user can edit
their own `user_metadata`, so a role written there would be a role the user can
grant themselves.

A pre-existing account is never touched. If the email already belongs to
someone, that is reported as its own condition and the caller must decide; this
client will not modify or delete an account it did not create, because doing so
during a compensation would let a provisioning attempt take over an existing
identity.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any
from uuid import UUID

import httpx

from app.config import Settings

logger = logging.getLogger(__name__)


class AuthAdminError(RuntimeError):
    """An Auth Admin call failed. The message never contains the secret key."""


class EmailAlreadyRegistered(AuthAdminError):
    """The email already belongs to an Auth account this backend did not create."""


@dataclass(frozen=True)
class AuthAdminUser:
    id: UUID
    email: str


class SupabaseAuthAdmin:
    """Administrative Auth operations, authenticated with the secret key."""

    def __init__(self, settings: Settings, *, client: httpx.AsyncClient | None = None) -> None:
        self._settings = settings
        self._client = client

    def __repr__(self) -> str:
        # Says nothing about the credential.
        return f"SupabaseAuthAdmin(url={self._settings.supabase_url!r})"

    __str__ = __repr__

    @property
    def _base(self) -> str:
        return f"{self._settings.supabase_url.rstrip('/')}/auth/v1"

    def _headers(self) -> dict[str, str]:
        # The Auth service requires both: `apikey` identifies the project, and
        # the bearer token carries the administrative authority.
        secret = self._settings.supabase_secret_key.get_secret_value()
        return {
            "apikey": secret,
            "Authorization": f"Bearer {secret}",
            "Content-Type": "application/json",
        }

    async def create_user(
        self,
        *,
        email: str,
        app_metadata: dict[str, Any],
        password: str | None = None,
        email_confirm: bool = True,
    ) -> AuthAdminUser:
        """Provision an Auth account with a trusted role in `app_metadata`."""
        payload: dict[str, Any] = {
            "email": email,
            "email_confirm": email_confirm,
            "app_metadata": app_metadata,
        }
        if password is not None:
            payload["password"] = password

        response = await self._request("POST", "/admin/users", json=payload)

        if response.status_code == httpx.codes.UNPROCESSABLE_ENTITY:
            if _looks_like_an_existing_email(response):
                raise EmailAlreadyRegistered(
                    "That email address already belongs to an account"
                )

        _raise_for_status(response, "create a user")
        return _user_from(response)

    async def delete_user(self, user_id: str | UUID) -> None:
        """Remove an account. Only ever used to undo one this backend just created."""
        response = await self._request("DELETE", f"/admin/users/{user_id}")
        _raise_for_status(response, "delete a user")

    async def _request(self, method: str, path: str, **kwargs: Any) -> httpx.Response:
        url = f"{self._base}{path}"
        try:
            if self._client is not None:
                return await self._client.request(
                    method, url, headers=self._headers(), timeout=10.0, **kwargs
                )
            async with httpx.AsyncClient(timeout=10.0) as client:
                return await client.request(method, url, headers=self._headers(), **kwargs)
        except httpx.HTTPError:
            # Deliberately not chained: an httpx error renders the request it
            # failed on, and that request carries the secret in its headers.
            logger.warning("Auth Admin request to %s failed", path, exc_info=False)
            raise AuthAdminError(
                f"The Auth Admin request to {path} could not be completed"
            ) from None


def _looks_like_an_existing_email(response: httpx.Response) -> bool:
    try:
        body = response.json()
    except ValueError:
        return False
    text = f"{body.get('error_code', '')} {body.get('msg', '')} {body.get('message', '')}".lower()
    return "already" in text or "exists" in text


def _raise_for_status(response: httpx.Response, what: str) -> None:
    if response.status_code >= httpx.codes.BAD_REQUEST:
        # Status only. A response body from an auth service can echo the request.
        raise AuthAdminError(f"Could not {what}: the Auth service returned {response.status_code}")


def _user_from(response: httpx.Response) -> AuthAdminUser:
    try:
        body = response.json()
        return AuthAdminUser(id=UUID(str(body["id"])), email=str(body["email"]))
    except (ValueError, KeyError, TypeError) as exc:
        raise AuthAdminError("The Auth service returned an unexpected user shape") from exc
