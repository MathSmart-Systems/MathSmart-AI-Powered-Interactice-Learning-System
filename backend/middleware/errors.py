"""One error envelope for the whole API.

The contract fixes the shape:

    {"error": {"code": ..., "message": ..., "fields": {...}, "request_id": ...}}

with `fields` omitted unless the failure is field-specific. It also fixes what
must never appear in a user-facing message: an answer key, internal SQL, a
provider secret, or a record outside the caller's scope. An unexpected exception
is therefore never rendered — it is logged against the request id and replaced
with a fixed sentence.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from middleware.request_context import REQUEST_ID_HEADER, current_request_id

logger = logging.getLogger(__name__)

#: Machine-readable code per status. The two the documentation names verbatim
#: are `validation_error` and `groq_assistance_unavailable`; the rest follow the
#: documented meaning of each status in the same style.
_CODE_BY_STATUS = {
    400: "bad_request",
    401: "unauthorized",
    403: "forbidden",
    404: "not_found",
    409: "conflict",
    412: "precondition_failed",
    422: "validation_error",
    429: "rate_limited",
    500: "internal_error",
    503: "service_unavailable",
}

GENERIC_SERVER_MESSAGE = "The request could not be completed."


def error_code_for(status_code: int) -> str:
    if status_code in _CODE_BY_STATUS:
        return _CODE_BY_STATUS[status_code]
    return "client_error" if status_code < 500 else "server_error"


def error_response(
    status_code: int,
    message: str,
    *,
    code: str | None = None,
    fields: dict[str, list[str]] | None = None,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    """Build the documented envelope. `fields` is omitted when there are none."""
    request_id = current_request_id()
    error: dict[str, Any] = {
        "code": code or error_code_for(status_code),
        "message": message,
        "request_id": request_id,
    }
    if fields:
        error["fields"] = fields

    response_headers = {REQUEST_ID_HEADER: request_id, **(headers or {})}
    return JSONResponse(status_code=status_code, content={"error": error}, headers=response_headers)


def _fields_from(exc: RequestValidationError) -> dict[str, list[str]]:
    fields: dict[str, list[str]] = {}
    for error in exc.errors():
        location = [str(part) for part in error.get("loc", ()) if part not in ("body", "query")]
        name = ".".join(location) or "body"
        fields.setdefault(name, []).append(str(error.get("msg", "Invalid value.")))
    return fields


def install_error_handlers(app: FastAPI) -> None:
    """Route every failure through the single envelope."""

    @app.exception_handler(StarletteHTTPException)
    async def _http_exception(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        headers = getattr(exc, "headers", None)
        return error_response(exc.status_code, str(exc.detail), headers=headers)

    @app.exception_handler(RequestValidationError)
    async def _validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        return error_response(
            422, "The request contains invalid fields.", fields=_fields_from(exc)
        )

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
        # Logged with the request id, never rendered: the exception text can
        # carry SQL, a column name, or a provider detail.
        logger.exception("Unhandled error on %s %s", request.method, request.url.path)
        return error_response(500, GENERIC_SERVER_MESSAGE)


__all__ = [
    "GENERIC_SERVER_MESSAGE",
    "HTTPException",
    "error_code_for",
    "error_response",
    "install_error_handlers",
]
