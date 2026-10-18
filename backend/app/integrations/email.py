"""Outbound email behind one small interface.

Resend sends it when RESEND_API_KEY and EMAIL_FROM are set. Without them nothing is emailed, and
every message records that email delivery isn't configured: the candidate portal still gets it.
The API key goes to Resend and nowhere else; it never reaches the frontend, a log line or an error.
"""

import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass

import httpx

from app.core.config import settings
from app.core.enums import EmailStatus

logger = logging.getLogger(__name__)

RESEND_URL = "https://api.resend.com"


@dataclass(frozen=True)
class OutboundEmail:
    to: str
    subject: str
    text: str
    # Sent as the provider's idempotency key, so a retried send is one email.
    idempotency_key: str | None = None


@dataclass(frozen=True)
class EmailResult:
    status: EmailStatus
    provider: str | None = None
    provider_message_id: str | None = None
    error: str | None = None  # safe to show a recruiter and to log


class EmailProvider(ABC):
    name: str
    configured: bool
    sender: str | None = None  # the From address candidates see

    @abstractmethod
    async def send(self, email: OutboundEmail) -> EmailResult: ...


class DisabledEmail(EmailProvider):
    """No email provider configured: portal delivery only."""

    name = "none"
    configured = False

    async def send(self, email: OutboundEmail) -> EmailResult:
        return EmailResult(EmailStatus.NOT_CONFIGURED)


class ResendEmail(EmailProvider):
    name = "resend"
    configured = True

    def __init__(
        self,
        api_key: str,
        sender: str,
        *,
        timeout: float = 10.0,
        transport: httpx.AsyncBaseTransport | None = None,
        base_url: str = RESEND_URL,
    ) -> None:
        self._api_key = api_key
        self.sender = sender
        self._timeout = timeout
        self._transport = transport
        self._base_url = base_url.rstrip("/")

    async def send(self, email: OutboundEmail) -> EmailResult:
        headers = {"Authorization": f"Bearer {self._api_key}"}
        if email.idempotency_key:
            headers["Idempotency-Key"] = email.idempotency_key
        payload = {"from": self.sender, "to": [email.to], "subject": email.subject, "text": email.text}
        try:
            async with httpx.AsyncClient(timeout=self._timeout, transport=self._transport) as client:
                response = await client.post(f"{self._base_url}/emails", json=payload, headers=headers)
        except httpx.HTTPError as exc:
            logger.warning("email.send_failed provider=resend error=%s", type(exc).__name__)
            return self._failed("Couldn't reach the email service. The message is in the candidate's portal.")
        if response.status_code >= 400:
            reason = _reason(response)
            logger.warning("email.send_refused provider=resend status=%s reason=%s", response.status_code, reason)
            return self._failed(f"The email service refused the email ({response.status_code}): {reason}")
        message_id = _json(response).get("id")
        return EmailResult(EmailStatus.SENT, self.name, str(message_id) if message_id else None)

    def _failed(self, error: str) -> EmailResult:
        return EmailResult(EmailStatus.FAILED, self.name, error=error)


def _json(response: httpx.Response) -> dict[str, object]:
    try:
        body = response.json()
    except ValueError:
        return {}
    return body if isinstance(body, dict) else {}


def _reason(response: httpx.Response) -> str:
    message = _json(response).get("message")
    text = message if isinstance(message, str) and message.strip() else response.reason_phrase or "no reason given"
    return text.strip()[:200]


def get_email_provider() -> EmailProvider:
    if settings.resend_api_key and settings.email_from:
        return ResendEmail(
            settings.resend_api_key.get_secret_value(), settings.email_from, timeout=settings.email_timeout_seconds
        )
    return DisabledEmail()
