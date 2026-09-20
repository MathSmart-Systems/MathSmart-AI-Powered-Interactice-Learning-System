"""Administrative Storage access, for the one operation that needs it.

A learner owns their profile picture and manages it themselves, under Storage's
own row-level policies, with their own token. Nothing in the ordinary request
path comes through here.

This exists for a single case: a permanently purged learner. By the time their
picture is deleted their account is gone, so there is no session left to act as
and no policy left to satisfy — the object would simply outlive them. The
secret key is therefore reached here, in its own module, so the reach stays
visible in the import graph rather than asserted in a comment.

It deletes. It cannot read an object, list a bucket, or produce a URL.
"""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

import httpx

from app.config import Settings

logger = logging.getLogger(__name__)

#: The bucket learners' pictures live in. One object per learner, named after
#: them, which is what makes a purge a single unambiguous deletion.
AVATAR_BUCKET = "avatars"


class StorageAdminError(RuntimeError):
    """Storage could not be reached, or refused."""


class SupabaseStorageAdmin:
    """Deletes objects a purged learner can no longer delete themselves."""

    def __init__(self, settings: Settings, *, client: httpx.AsyncClient | None = None) -> None:
        self._settings = settings
        self._client = client

    def __repr__(self) -> str:
        # Says nothing about the credential.
        return f"SupabaseStorageAdmin(url={self._settings.supabase_url!r})"

    __str__ = __repr__

    @property
    def _base(self) -> str:
        return f"{self._settings.supabase_url.rstrip('/')}/storage/v1"

    def _headers(self) -> dict[str, str]:
        secret = self._settings.supabase_secret_key.get_secret_value()
        return {
            "apikey": secret,
            "Authorization": f"Bearer {secret}",
        }

    async def delete_avatar(self, user_id: str | UUID, *, missing_ok: bool = True) -> bool:
        """Remove one learner's picture. Answers whether there was one.

        A learner who never uploaded a picture is the ordinary case, not a
        failure, so a 404 is success — and a purge that treated it otherwise
        could never finish for most of the learners it runs on.
        """
        response = await self._request("DELETE", f"/object/{AVATAR_BUCKET}/{user_id}")

        if response.status_code == httpx.codes.NOT_FOUND:
            return False
        if response.status_code >= httpx.codes.BAD_REQUEST:
            if missing_ok and response.status_code == httpx.codes.BAD_REQUEST:
                # Storage answers 400 for an object that is not there on some
                # versions. Treated the same way as 404, and for the same
                # reason.
                return False
            # Status only. A Storage response body echoes the request path.
            raise StorageAdminError(
                f"Could not delete a stored object: Storage returned {response.status_code}"
            )
        return True

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
            logger.warning("Storage Admin request to %s failed", path, exc_info=False)
            raise StorageAdminError(
                f"The Storage request to {path} could not be completed"
            ) from None
