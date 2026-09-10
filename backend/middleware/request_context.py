"""Per-request correlation identity.

Every error response carries a `request_id`, and every audit record stores one,
so the identifier has to exist before anything can fail. It is generated at the
edge, reused when a gateway already supplied one, echoed back as a response
header, and made available to anything deeper in the request through a
`ContextVar` rather than by threading it through every signature.
"""

from __future__ import annotations

import uuid
from contextvars import ContextVar

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

REQUEST_ID_HEADER = "X-Request-Id"
_REQUEST_ID_PREFIX = "req_"
_MAX_SUPPLIED_LENGTH = 128

_request_id: ContextVar[str] = ContextVar("mathsmart_request_id", default="")


def new_request_id() -> str:
    return f"{_REQUEST_ID_PREFIX}{uuid.uuid4().hex}"


def current_request_id() -> str:
    """The identifier for the request being handled, or a fresh one outside a request."""
    return _request_id.get() or new_request_id()


class RequestIdMiddleware(BaseHTTPMiddleware):
    """Assigns a correlation id to every request and returns it to the caller."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        supplied = request.headers.get(REQUEST_ID_HEADER, "").strip()
        # A caller-supplied value is echoed so a trace can span the gateway, but
        # it is bounded and never interpreted.
        request_id = supplied[:_MAX_SUPPLIED_LENGTH] if supplied else new_request_id()

        token = _request_id.set(request_id)
        try:
            response = await call_next(request)
        finally:
            _request_id.reset(token)

        response.headers[REQUEST_ID_HEADER] = request_id
        return response
