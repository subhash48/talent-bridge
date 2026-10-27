"""Outbound email: Resend when configured, an honest "not configured" when not."""

import json

import httpx
import pytest
from httpx import AsyncClient
from pydantic import SecretStr

from app.core.config import settings
from app.core.enums import EmailStatus
from app.integrations.email import (
    DisabledEmail,
    OutboundEmail,
    ResendEmail,
    get_email_provider,
)
from app.main import app
from tests.conftest import API

EMAIL = OutboundEmail(to="sophia@example.com", subject="Your interview", text="Hi Sophia", idempotency_key="msg-1")
KEY = "re_test_key_123"


async def test_without_a_provider_nothing_is_emailed() -> None:
    result = await DisabledEmail().send(EMAIL)
    assert (result.status, result.provider, result.error) == (EmailStatus.NOT_CONFIGURED, None, None)


async def test_resend_sends_the_email() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json={"id": "4ef9a417-02e9-4d39-ad75-9611e0fcc33c"})

    provider = ResendEmail(KEY, "Kavuntra <updates@example.com>", transport=httpx.MockTransport(handler))
    result = await provider.send(EMAIL)
    assert (result.status, result.provider, result.provider_message_id) == (
        EmailStatus.SENT,
        "resend",
        "4ef9a417-02e9-4d39-ad75-9611e0fcc33c",
    )
    [request] = seen
    assert str(request.url) == "https://api.resend.com/emails"
    assert request.headers["authorization"] == f"Bearer {KEY}"
    assert request.headers["idempotency-key"] == "msg-1"
    assert json.loads(request.content) == {
        "from": "Kavuntra <updates@example.com>",
        "to": ["sophia@example.com"],
        "subject": "Your interview",
        "text": "Hi Sophia",
    }


async def test_a_refused_email_fails_with_a_safe_reason() -> None:
    def refuse(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            422,
            json={"statusCode": 422, "name": "validation_error", "message": "The example.com domain is not verified."},
        )

    result = await ResendEmail(KEY, "x@example.com", transport=httpx.MockTransport(refuse)).send(EMAIL)
    assert result.status == EmailStatus.FAILED
    assert result.error == "The email service refused the email (422): The example.com domain is not verified."
    assert KEY not in (result.error or "")


async def test_an_unreachable_provider_fails_and_says_the_portal_has_it() -> None:
    def down(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("no route to host")

    result = await ResendEmail(KEY, "x@example.com", transport=httpx.MockTransport(down)).send(EMAIL)
    assert result.status == EmailStatus.FAILED
    assert result.error == "Couldn't reach the email service. The message is in the candidate's portal."


def test_resend_is_used_only_when_both_settings_are_set(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "resend_api_key", None)
    monkeypatch.setattr(settings, "email_from", "x@example.com")
    assert isinstance(get_email_provider(), DisabledEmail)
    monkeypatch.setattr(settings, "resend_api_key", SecretStr(KEY))
    monkeypatch.setattr(settings, "email_from", None)
    assert isinstance(get_email_provider(), DisabledEmail)
    monkeypatch.setattr(settings, "email_from", "Kavuntra <updates@example.com>")
    provider = get_email_provider()
    assert isinstance(provider, ResendEmail) and provider.sender == "Kavuntra <updates@example.com>"


async def test_recruiters_can_see_whether_email_is_configured(client: AsyncClient) -> None:
    assert (await client.get(f"{API}/communication/email")).json() == {
        "configured": False,
        "provider": None,
        "sender": None,
    }
    app.dependency_overrides[get_email_provider] = lambda: ResendEmail(KEY, "Kavuntra <updates@example.com>")
    shown = (await client.get(f"{API}/communication/email")).json()
    assert shown == {"configured": True, "provider": "resend", "sender": "Kavuntra <updates@example.com>"}
    assert KEY not in json.dumps(shown)
