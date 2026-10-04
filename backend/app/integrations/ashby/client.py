"""Ashby's API: POST https://api.ashbyhq.com/<resource>.<verb> with a JSON body and Basic auth (the
API key as the username, no password).

Ashby answers most request errors with HTTP 200 and {"success": false}; the error code is in
errorInfo.code or in errors[] (a string or a {code, message} object). Rate limits and server errors
are retried with backoff. The API key is only ever sent to Ashby: it is never logged or put in an
error message.
"""

import asyncio
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

# The permission each endpoint needs, so a refusal can say exactly what to enable on the key.
PERMISSIONS = {
    "application": "candidatesRead",
    "candidate": "candidatesRead",
    "job": "jobsRead",
    "interview": "interviewsRead",
    "interviewSchedule": "interviewsRead",
    "interviewStage": "interviewsRead",
}
# Errors that mean "drop the sync token and cursor and start a full sync" (Ashby's sync guide).
RESTART_SYNC_CODES = frozenset(
    {
        "sync_token_expired",
        "sync_token_invalid",
        "incremental_sync_too_large",
        "next_cursor_expired",
        "cursor_invalid",
        "invalid_next_cursor",
    }
)
PAGE_SIZE = 100


class AshbyError(Exception):
    """An Ashby call failed. str(error) is safe to log and to show a recruiter."""

    def __init__(self, message: str, *, code: str | None = None) -> None:
        super().__init__(message)
        self.code = code


class AshbyRestartSync(AshbyError):
    """The sync token or cursor can't be used any more: run a full sync instead."""


@dataclass
class ListResult:
    results: list[dict[str, Any]] = field(default_factory=list)
    sync_token: str | None = None


class AshbyClient:
    def __init__(
        self,
        api_key: str,
        *,
        base_url: str = "https://api.ashbyhq.com",
        transport: httpx.AsyncBaseTransport | None = None,
        timeout: float = 20.0,
        max_retries: int = 3,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    ) -> None:
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._transport = transport
        self._timeout = timeout
        self._max_retries = max_retries
        self._sleep = sleep

    def __repr__(self) -> str:  # never shows the key
        return f"AshbyClient(base_url={self._base_url!r})"

    async def call(self, endpoint: str, body: dict[str, Any] | None = None) -> dict[str, Any]:
        """One RPC call. Returns the response object; raises AshbyError when it didn't succeed."""
        attempt = 0
        while True:
            try:
                response = await self._post(endpoint, body or {})
            except httpx.HTTPError as exc:
                if attempt < self._max_retries:
                    attempt += 1
                    await self._sleep(0.5 * 2**attempt)
                    continue
                raise AshbyError(f"Couldn't reach Ashby ({endpoint}: {exc.__class__.__name__}).") from None

            if response.status_code == 429 or response.status_code >= 500:
                if attempt < self._max_retries:
                    attempt += 1
                    await self._sleep(_retry_after(response) or 0.5 * 2**attempt)
                    continue
                raise AshbyError(f"Ashby is unavailable ({endpoint}: HTTP {response.status_code}).")
            if response.status_code in (401, 403):
                raise AshbyError(_permission_message(endpoint, response.status_code), code="unauthorized")
            try:
                data = response.json()
            except ValueError:
                raise AshbyError(f"Ashby returned a non-JSON response ({endpoint}).") from None
            if response.status_code >= 400 or not isinstance(data, dict) or not data.get("success"):
                code, message = _error_of(data)
                if code in RESTART_SYNC_CODES:
                    raise AshbyRestartSync(f"Ashby asked for a full sync ({code}).", code=code)
                if code == "missing_endpoint_permission":
                    raise AshbyError(_permission_message(endpoint, 403), code=code)
                raise AshbyError(f"Ashby rejected {endpoint}: {message or code or 'unknown error'}.", code=code)
            return data

    async def list_all(self, endpoint: str, *, sync_token: str | None = None, **params: Any) -> ListResult:
        """Every page of a list endpoint. With sync_token, only what changed since that sync."""
        result = ListResult()
        cursor: str | None = None
        while True:
            body: dict[str, Any] = {"limit": PAGE_SIZE, **params}
            if sync_token:
                body["syncToken"] = sync_token
            if cursor:
                body["cursor"] = cursor
            data = await self.call(endpoint, body)
            result.results.extend(data.get("results") or [])
            cursor = data.get("nextCursor")
            if not data.get("moreDataAvailable") or not cursor:
                result.sync_token = data.get("syncToken") or sync_token
                return result

    async def application_info(self, application_id: str) -> dict[str, Any]:
        return (await self.call("application.info", {"applicationId": application_id}))["results"]

    async def job_info(self, job_id: str) -> dict[str, Any]:
        return (await self.call("job.info", {"id": job_id, "expand": ["location"]}))["results"]

    async def interview_info(self, interview_id: str) -> dict[str, Any]:
        return (await self.call("interview.info", {"id": interview_id}))["results"]

    async def api_key_info(self) -> dict[str, Any]:
        return (await self.call("apiKey.info")).get("results") or {}

    async def _post(self, endpoint: str, body: dict[str, Any]) -> httpx.Response:
        async with httpx.AsyncClient(
            base_url=self._base_url, auth=(self._api_key, ""), timeout=self._timeout, transport=self._transport
        ) as client:
            return await client.post(f"/{endpoint}", json=body, headers={"Accept": "application/json"})


def _error_of(data: Any) -> tuple[str | None, str | None]:
    """(code, message) from either error format Ashby documents."""
    if not isinstance(data, dict):
        return None, None
    info = data.get("errorInfo")
    if isinstance(info, dict) and info.get("code"):
        return str(info["code"]), info.get("message")
    for item in data.get("errors") or []:
        if isinstance(item, str):
            return item, item
        if isinstance(item, dict):
            return item.get("code") or item.get("message"), item.get("message")
    return None, None


def _retry_after(response: httpx.Response) -> float | None:
    try:
        return min(float(response.headers.get("Retry-After", "")), 30.0)
    except ValueError:
        return None


def _permission_message(endpoint: str, status: int) -> str:
    permission = PERMISSIONS.get(endpoint.split(".")[0], "the matching read permission")
    return f"Ashby refused {endpoint} (HTTP {status}): give the API key the {permission} permission."


def get_ashby_client() -> AshbyClient | None:
    """The configured client, or None when ASHBY_API_KEY isn't set."""
    if not settings.ashby_api_key:
        return None
    return AshbyClient(
        settings.ashby_api_key.get_secret_value(),
        base_url=settings.ashby_api_url,
        timeout=settings.ashby_timeout_seconds,
    )
