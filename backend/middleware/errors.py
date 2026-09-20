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

import asyncpg
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.base import BaseHTTPMiddleware

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


class ApiError(Exception):
    """A failure that names its own machine-readable code.

    Most failures can take the code implied by their status. Some need to be
    distinguishable from their neighbours — an account that has been disabled is
    not the same thing to a client as an ownership refusal, though both are 403.
    """

    def __init__(
        self,
        status_code: int,
        message: str,
        *,
        code: str | None = None,
        fields: dict[str, list[str]] | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message
        self.code = code
        self.fields = fields


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


class ErrorSafetyNetMiddleware(BaseHTTPMiddleware):
    """Turns anything that escapes into an envelope a browser can read.

    FastAPI answers an unhandled exception from Starlette's own
    `ServerErrorMiddleware`, which sits above every middleware added here —
    including CORS. That reply therefore carries no
    `Access-Control-Allow-Origin`, and a browser refuses to hand it to the
    page: the fetch rejects with `TypeError: Failed to fetch` and the
    interface can only report that the service is unavailable. The status, the
    code and the request id are all there, and none of them reach the person.

    Installed inside the CORS middleware so the reply is a normal one. Nothing
    is rendered from the exception itself; it is logged against the request id.
    """

    async def dispatch(self, request: Request, call_next: Any) -> Any:
        try:
            return await call_next(request)
        except Exception:
            logger.exception(
                "Unhandled error on %s %s", request.method, request.url.path
            )
            return error_response(500, GENERIC_SERVER_MESSAGE)


#: Unique constraints a caller can hit, and what to say about each. A
#: constraint absent from here still answers 409, just without naming a field:
#: better a correct status with a general sentence than a guess at which input
#: was at fault.
_UNIQUE_FIELDS: dict[str, tuple[str, str]] = {
    "competencies_code_key": (
        "code",
        "Another competency already uses that code. Codes are upper case and "
        "must be unique across the catalogue.",
    ),
    "student_profiles_learner_id_key": (
        "learner_id",
        "That learner id already belongs to a learner.",
    ),
}


def install_error_handlers(app: FastAPI) -> None:
    """Route every failure through the single envelope."""

    @app.exception_handler(ApiError)
    async def _api_error(request: Request, exc: ApiError) -> JSONResponse:
        return error_response(exc.status_code, exc.message, code=exc.code, fields=exc.fields)

    @app.exception_handler(StarletteHTTPException)
    async def _http_exception(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        headers = getattr(exc, "headers", None)
        return error_response(exc.status_code, str(exc.detail), headers=headers)

    @app.exception_handler(RequestValidationError)
    async def _validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        return error_response(
            422, "The request contains invalid fields.", fields=_fields_from(exc)
        )

    @app.exception_handler(asyncpg.exceptions.InsufficientPrivilegeError)
    async def _insufficient_privilege(
        request: Request, exc: asyncpg.exceptions.InsufficientPrivilegeError
    ) -> JSONResponse:
        """A grant this database does not have, answered as a deployment fault.

        This is never the caller's mistake. Every route that reaches a table
        has already checked the role, so a privilege error means the database
        is missing a grant or a policy the code expects — a migration that has
        not been applied here. Saying so is far more use than "the request
        could not be completed", and it is a 503 because retrying the same
        request will not help until somebody deploys.

        The driver's hint names the exact GRANT, which is why it is logged and
        never rendered.
        """
        logger.error(
            "Missing privilege on %s %s — a migration is probably not applied here",
            request.method,
            request.url.path,
        )
        return error_response(
            503,
            "This action is not set up on this database yet. A pending migration has "
            "not been applied here.",
            code="not_configured",
        )

    @app.exception_handler(asyncpg.exceptions.UniqueViolationError)
    async def _unique_violation(
        request: Request, exc: asyncpg.exceptions.UniqueViolationError
    ) -> JSONResponse:
        """A value that another record already uses, answered as a conflict.

        Handled ahead of the general constraint case because it is the one a
        caller can actually act on: something they typed is already taken, and
        the reply says which field rather than the sentence that covers every
        constraint in the schema. `docs/API_ROUTES.md` documents 409 for a
        duplicate code, and this is what makes that true.

        The constraint name is matched, never rendered — it carries the table
        and the column.
        """
        constraint = getattr(exc, "constraint_name", None) or ""
        field = _UNIQUE_FIELDS.get(constraint)

        logger.warning(
            "Unique violation on %s %s: %s",
            request.method,
            request.url.path,
            constraint or type(exc).__name__,
        )

        if field is None:
            return error_response(
                409,
                "Another record already uses one of those values.",
                code="conflict",
            )

        label, message = field
        return error_response(
            409,
            message,
            code="conflict",
            fields={label: [message]},
        )

    @app.exception_handler(asyncpg.exceptions.IntegrityConstraintViolationError)
    async def _integrity_violation(
        request: Request, exc: asyncpg.exceptions.IntegrityConstraintViolationError
    ) -> JSONResponse:
        """A constraint the request broke, answered as a refusal not a crash.

        Reaching the database with a value it cannot accept is the caller's
        mistake, not the server falling over, and it has to come back as a 4xx
        the browser will actually let the page read. An unhandled exception is
        answered by Starlette's outermost error middleware, which sits above
        the CORS middleware — so that reply carries no
        `Access-Control-Allow-Origin`, and a browser can only report it as
        "Failed to fetch". Handling it here keeps the reply inside CORS.

        The exception text is logged, never rendered: it carries the table,
        the column and the constraint name.
        """
        logger.warning(
            "Constraint violation on %s %s: %s",
            request.method,
            request.url.path,
            type(exc).__name__,
        )
        return error_response(
            422,
            "The request refers to a record that does not exist, or one that "
            "another record already uses.",
            code="constraint_violation",
        )

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
        # Logged with the request id, never rendered: the exception text can
        # carry SQL, a column name, or a provider detail.
        logger.exception("Unhandled error on %s %s", request.method, request.url.path)
        return error_response(500, GENERIC_SERVER_MESSAGE)


__all__ = [
    "GENERIC_SERVER_MESSAGE",
    "ApiError",
    "ErrorSafetyNetMiddleware",
    "HTTPException",
    "error_code_for",
    "error_response",
    "install_error_handlers",
]
