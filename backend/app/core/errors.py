"""Structured API errors.

Every error response has the same shape, so the frontend can always show a friendly message:

    {"error": {"code": "not_found", "message": "Candidate not found.", "details": null}}
"""

import logging
from typing import Any, ClassVar

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.types import ASGIApp, Message, Receive, Scope, Send

logger = logging.getLogger(__name__)


class AppError(Exception):
    status_code = 500
    code = "internal_error"
    headers: ClassVar[dict[str, str] | None] = None

    def __init__(self, message: str, *, code: str | None = None, details: Any = None) -> None:
        super().__init__(message)
        self.message = message
        self.details = details
        if code:
            self.code = code


class BadRequestError(AppError):
    status_code = 400
    code = "bad_request"


class InvalidStageTransitionError(BadRequestError):
    code = "invalid_stage_transition"


class UnauthorizedError(AppError):
    status_code = 401
    code = "unauthorized"
    headers: ClassVar[dict[str, str] | None] = {"WWW-Authenticate": "Bearer"}


class ForbiddenError(AppError):
    status_code = 403
    code = "forbidden"


class NotFoundError(AppError):
    status_code = 404
    code = "not_found"


class ConflictError(AppError):
    status_code = 409
    code = "conflict"


class ServiceUnavailableError(AppError):
    status_code = 503
    code = "service_unavailable"


def error_body(code: str, message: str, details: Any = None) -> dict[str, Any]:
    return {"error": {"code": code, "message": message, "details": details}}


HTTP_CODES = {
    400: "bad_request",
    401: "unauthorized",
    403: "forbidden",
    404: "not_found",
    405: "method_not_allowed",
    409: "conflict",
    429: "rate_limited",
}


async def _app_error(_request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, AppError)
    return JSONResponse(
        error_body(exc.code, exc.message, exc.details), status_code=exc.status_code, headers=exc.headers
    )


async def _http_error(_request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, StarletteHTTPException)
    message = exc.detail if isinstance(exc.detail, str) else "Request failed."
    if exc.status_code == 404 and message == "Not Found":
        message = "This endpoint doesn't exist."
    return JSONResponse(
        error_body(HTTP_CODES.get(exc.status_code, "http_error"), message),
        status_code=exc.status_code,
        headers=exc.headers,
    )


async def _validation_error(_request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, RequestValidationError)
    details = [
        {
            "field": ".".join(str(part) for part in error["loc"] if part not in ("body", "query", "path")),
            "message": error["msg"],
        }
        for error in exc.errors()
    ]
    first = details[0] if details else None
    message = f"{first['field'] or 'Request'}: {first['message']}" if first else "The request is invalid."
    return JSONResponse(error_body("validation_error", message, details), status_code=422)


async def _integrity_error(_request: Request, exc: Exception) -> JSONResponse:
    logger.warning("Integrity error: %s", exc)
    return JSONResponse(
        error_body("conflict", "This change conflicts with existing data. Refresh and try again."),
        status_code=409,
    )


class UnhandledErrorMiddleware:
    """Turns unexpected exceptions into the JSON error shape.

    It sits inside CORSMiddleware, so a 500 still carries CORS headers and the browser shows our
    message instead of an opaque network error.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        started = False

        async def send_tracking(message: Message) -> None:
            nonlocal started
            if message["type"] == "http.response.start":
                started = True
            await send(message)

        try:
            await self.app(scope, receive, send_tracking)
        except Exception:
            logger.exception("Unhandled error on %s %s", scope.get("method"), scope.get("path"))
            if started:
                raise
            response = JSONResponse(
                error_body("internal_error", "Something went wrong on our side. Please try again."),
                status_code=500,
            )
            await response(scope, receive, send)


def register_error_handlers(app: FastAPI) -> None:
    """Register before adding CORSMiddleware, so CORS wraps the error middleware."""
    app.add_exception_handler(AppError, _app_error)
    app.add_exception_handler(StarletteHTTPException, _http_error)
    app.add_exception_handler(RequestValidationError, _validation_error)
    app.add_exception_handler(IntegrityError, _integrity_error)
    app.add_middleware(UnhandledErrorMiddleware)
