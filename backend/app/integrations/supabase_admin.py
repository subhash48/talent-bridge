"""Supabase Auth's admin API, used for one thing: inviting candidates to the portal.

The secret (service role) key lives in backend/.env only and is sent to Supabase and nowhere else;
it never reaches the frontend, a log line or an error message. No password is ever created here:
Supabase emails the candidate a one-time link, and they choose their own password.
"""

import logging
import uuid
from dataclasses import dataclass
from typing import Any

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


class SupabaseAdminError(Exception):
    """The invitation failed. str(error) is safe to show a recruiter and to log."""


class AuthUserExists(SupabaseAdminError):
    """Supabase already has an account for this email, so no new one was created."""


@dataclass(frozen=True)
class InvitedUser:
    id: uuid.UUID
    email: str


class SupabaseAdmin:
    def __init__(
        self,
        url: str,
        secret_key: str,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
        timeout: float = 10.0,
    ) -> None:
        self._url = url.rstrip("/")
        self._secret_key = secret_key
        self._transport = transport
        self._timeout = timeout

    def _headers(self) -> dict[str, str]:
        headers = {"apikey": self._secret_key}
        # A legacy service_role key is a JWT and also goes in Authorization; the newer sb_secret_
        # keys are sent as apikey only.
        if self._secret_key.startswith("eyJ"):
            headers["Authorization"] = f"Bearer {self._secret_key}"
        return headers

    async def invite(self, email: str, *, redirect_to: str, data: dict[str, Any]) -> InvitedUser:
        """Create the account and send Supabase's invitation email. Raises AuthUserExists if the
        email already has an account, SupabaseAdminError for anything else."""
        try:
            async with httpx.AsyncClient(timeout=self._timeout, transport=self._transport) as client:
                response = await client.post(
                    f"{self._url}/auth/v1/invite",
                    params={"redirect_to": redirect_to},
                    headers=self._headers(),
                    json={"email": email, "data": data},
                )
        except httpx.HTTPError as exc:
            raise SupabaseAdminError(f"Couldn't reach Supabase Auth ({exc.__class__.__name__}).") from None

        if response.status_code in (400, 422) and _is_existing_user(response):
            raise AuthUserExists("This email already has a Talent Bridge sign-in.")
        if response.status_code == 429:
            raise SupabaseAdminError("Supabase is rate limiting invitation emails. It will be retried.")
        if response.status_code in (401, 403):
            raise SupabaseAdminError("Supabase refused the secret key. Check SUPABASE_SECRET_KEY.")
        if response.status_code >= 400:
            raise SupabaseAdminError(f"Supabase Auth returned HTTP {response.status_code}.")
        try:
            body = response.json()
            return InvitedUser(id=uuid.UUID(body["id"]), email=str(body.get("email") or email).lower())
        except (ValueError, KeyError, TypeError):
            raise SupabaseAdminError("Supabase Auth returned an unexpected response.") from None


def _is_existing_user(response: httpx.Response) -> bool:
    try:
        body = response.json()
    except ValueError:
        return False
    if not isinstance(body, dict):
        return False
    code = str(body.get("error_code") or body.get("code") or "")
    message = str(body.get("msg") or body.get("message") or "").lower()
    return code in {"email_exists", "user_already_exists"} or "already been registered" in message


def get_supabase_admin() -> SupabaseAdmin | None:
    """The admin client, or None when SUPABASE_URL or the secret key isn't set (invites then wait)."""
    if not settings.supabase_url or not settings.supabase_secret_key:
        return None
    return SupabaseAdmin(settings.supabase_url, settings.supabase_secret_key.get_secret_value())
