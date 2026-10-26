"""Supabase Auth's admin API, used for one thing: inviting candidates to the portal.

The secret (service role) key lives in backend/.env only and is sent to Supabase and nowhere else;
it never reaches the frontend, a log line or an error message. No password is ever created here: the
candidate gets a one-time link and chooses their own password. Supabase emails that link itself
(invite, send_sign_in_link), or hands it back for TalentBridge to email with its own message
(invite_link, sign_in_link_url) when an email provider is configured.
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
    # The one-time link, when Supabase handed it back instead of emailing it (invite_link). A secret:
    # it goes in the candidate's email and nowhere else, never a log line.
    action_link: str | None = None


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
            raise AuthUserExists("This email already has a TalentBridge sign-in.")
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

    async def invite_link(self, email: str, *, redirect_to: str, data: dict[str, Any]) -> InvitedUser:
        """Like invite, but nothing is emailed: the account is created and its one-time invitation link
        comes back, for TalentBridge's own email. Raises AuthUserExists if the email has an account."""
        body = await self._generate_link({"type": "invite", "email": email, "data": data, "redirect_to": redirect_to})
        try:
            return InvitedUser(
                id=uuid.UUID(str(body.get("id") or body["user"]["id"])),
                email=str(body.get("email") or email).lower(),
                action_link=_action_link(body),
            )
        except (ValueError, KeyError, TypeError):
            raise SupabaseAdminError("Supabase Auth returned an unexpected response.") from None

    async def sign_in_link_url(self, email: str, *, redirect_to: str) -> str:
        """A one-time sign-in link for an existing account, handed back rather than emailed."""
        body = await self._generate_link({"type": "magiclink", "email": email, "redirect_to": redirect_to})
        return _action_link(body)

    async def _generate_link(self, payload: dict[str, Any]) -> dict[str, Any]:
        try:
            async with httpx.AsyncClient(timeout=self._timeout, transport=self._transport) as client:
                response = await client.post(
                    f"{self._url}/auth/v1/admin/generate_link", headers=self._headers(), json=payload
                )
        except httpx.HTTPError as exc:
            raise SupabaseAdminError(f"Couldn't reach Supabase Auth ({exc.__class__.__name__}).") from None
        if response.status_code in (400, 422) and _is_existing_user(response):
            raise AuthUserExists("This email already has a TalentBridge sign-in.")
        if response.status_code == 429:
            raise SupabaseAdminError("Supabase is rate limiting sign-in links. It will be retried.")
        if response.status_code in (401, 403):
            raise SupabaseAdminError("Supabase refused the secret key. Check SUPABASE_SECRET_KEY.")
        if response.status_code >= 400:
            raise SupabaseAdminError(f"Supabase Auth returned HTTP {response.status_code}.")
        try:
            body = response.json()
        except ValueError:
            raise SupabaseAdminError("Supabase Auth returned an unexpected response.") from None
        if not isinstance(body, dict):
            raise SupabaseAdminError("Supabase Auth returned an unexpected response.")
        return body

    async def send_sign_in_link(self, email: str, *, redirect_to: str) -> None:
        """Email a one-time sign-in link to an existing account. Never creates an account. Raises
        SupabaseAdminError when it can't be sent."""
        try:
            async with httpx.AsyncClient(timeout=self._timeout, transport=self._transport) as client:
                response = await client.post(
                    f"{self._url}/auth/v1/otp",
                    params={"redirect_to": redirect_to},
                    headers=self._headers(),
                    json={"email": email, "create_user": False},
                )
        except httpx.HTTPError as exc:
            raise SupabaseAdminError(f"Couldn't reach Supabase Auth ({exc.__class__.__name__}).") from None
        if response.status_code == 429:
            raise SupabaseAdminError("Supabase is rate limiting sign-in emails. Try again in a minute.")
        if response.status_code >= 400:
            raise SupabaseAdminError(f"Supabase Auth returned HTTP {response.status_code}.")


def _action_link(body: dict[str, Any]) -> str:
    """The link from a generate_link response: at the top level, or under properties in older versions."""
    link = body.get("action_link") or (body.get("properties") or {}).get("action_link")
    if not isinstance(link, str) or not link.startswith(("https://", "http://")):
        raise SupabaseAdminError("Supabase Auth returned an unexpected response.")
    return link


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
