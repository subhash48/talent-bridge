"""The public website's contact form: every message is kept, and emailed to the right team when that's set up."""

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import settings
from app.models import ContactRequest
from app.services import contact_service
from tests.conftest import API, FakeEmail, use_email

MESSAGE = {
    "name": "Priya Nair",
    "email": "Priya@Northwind.example",
    "company": "Northwind Labs",
    "topic": "general",
    "subject": "A pilot for our next three hires",
    "message": "We'd like to try Hirvello with our next three hires.",
}


@pytest.fixture(autouse=True)
def _team_addresses(monkeypatch: pytest.MonkeyPatch) -> None:
    # Never the real groups in a test.
    monkeypatch.setattr(settings, "contact_business_email", "business@hirvello.example")
    monkeypatch.setattr(settings, "contact_support_email", "support@hirvello.example")


async def test_a_message_is_kept_even_without_email(
    anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession]
) -> None:
    sent = await anonymous.post(f"{API}/contact", json=MESSAGE)
    assert sent.status_code == 200 and sent.json() == {"received": True}
    async with sessions() as session:
        [row] = (await session.scalars(select(ContactRequest))).all()
    assert (row.email, row.topic, row.company, row.email_status) == (
        "priya@northwind.example",
        "general",
        "Northwind Labs",
        "not_configured",
    )
    # The subject is kept at the top of the message: no column of its own, so the table needs no change.
    assert row.message == f"Subject: {MESSAGE['subject']}\n\n{MESSAGE['message']}"


async def test_business_inquiries_go_to_business_with_the_sender_as_reply_to(
    anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession]
) -> None:
    mail = use_email(FakeEmail())
    assert (await anonymous.post(f"{API}/contact", json=MESSAGE)).status_code == 200
    [email] = mail.sent
    assert (email.to, email.reply_to, email.subject) == (
        "business@hirvello.example",
        "priya@northwind.example",
        "[Business inquiry] A pilot for our next three hires",
    )
    assert "From: Priya Nair <priya@northwind.example>" in email.text and MESSAGE["message"] in email.text
    async with sessions() as session:
        assert (await session.scalar(select(ContactRequest.email_status))) == "sent"


@pytest.mark.parametrize(
    ("topic", "team"),
    [
        ("support", "support@hirvello.example"),
        ("product", "support@hirvello.example"),
        ("general", "business@hirvello.example"),
        ("partnerships", "business@hirvello.example"),
        ("pilot", "business@hirvello.example"),  # Book a demo
    ],
)
async def test_each_topic_reaches_its_team(anonymous: AsyncClient, topic: str, team: str) -> None:
    mail = use_email(FakeEmail())
    assert (await anonymous.post(f"{API}/contact", json={**MESSAGE, "topic": topic})).status_code == 200
    assert [email.to for email in mail.sent] == [team]


async def test_the_browser_cant_choose_where_mail_goes(anonymous: AsyncClient) -> None:
    mail = use_email(FakeEmail())
    sneaky = {**MESSAGE, "to": "someone@elsewhere.example", "reply_to": "victim@elsewhere.example"}
    assert (await anonymous.post(f"{API}/contact", json=sneaky)).status_code == 200
    [email] = mail.sent
    assert (email.to, email.reply_to) == ("business@hirvello.example", "priya@northwind.example")


async def test_a_refused_email_still_keeps_the_message(
    anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession]
) -> None:
    use_email(FakeEmail(fail="The example.com domain is not verified."))
    assert (await anonymous.post(f"{API}/contact", json=MESSAGE)).status_code == 200
    async with sessions() as session:
        assert (await session.scalar(select(ContactRequest.email_status))) == "failed"


async def test_line_breaks_cant_reach_the_email_header(anonymous: AsyncClient) -> None:
    mail = use_email(FakeEmail())
    messy = {**MESSAGE, "name": "Priya\r\nNair", "subject": "Hello\r\nBcc: everyone@example.com", "company": "  "}
    assert (await anonymous.post(f"{API}/contact", json=messy)).status_code == 200
    [email] = mail.sent
    assert email.subject == "[Business inquiry] Hello Bcc: everyone@example.com"
    assert "\n" not in email.subject and "From: Priya Nair <" in email.text and "Company: not given" in email.text


async def test_the_form_is_checked(anonymous: AsyncClient) -> None:
    for bad in (
        {"email": "nope"},
        {"topic": "sales"},
        {"subject": ""},
        {"subject": "   "},
        {"subject": "\x00\x01"},
        {"subject": "x" * 151},
        {"message": ""},
        {"message": " \x00 "},
        {"message": "x" * 4801},
        {"name": ""},
        {"name": "\r\n"},
    ):
        assert (await anonymous.post(f"{API}/contact", json={**MESSAGE, **bad})).status_code == 422, bad
    without_subject = {key: value for key, value in MESSAGE.items() if key != "subject"}
    assert (await anonymous.post(f"{API}/contact", json=without_subject)).status_code == 422


async def test_form_fillers_are_ignored_and_floods_slowed(
    anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession]
) -> None:
    mail = use_email(FakeEmail())
    bot = await anonymous.post(f"{API}/contact", json={**MESSAGE, "website": "https://spam.example"})
    assert bot.status_code == 200 and mail.sent == []
    async with sessions() as session:
        assert (await session.scalars(select(ContactRequest))).all() == []
    for _ in range(contact_service.PER_WINDOW):
        assert (await anonymous.post(f"{API}/contact", json=MESSAGE)).status_code == 200
    slowed = await anonymous.post(f"{API}/contact", json=MESSAGE)
    assert slowed.status_code == 429 and slowed.json()["error"]["code"] == "too_many_messages"
    # Someone else isn't held up by it.
    other = await anonymous.post(f"{API}/contact", json=MESSAGE, headers={"X-Forwarded-For": "203.0.113.9"})
    assert other.status_code == 200


async def test_there_is_no_address_lookup_any_more(anonymous: AsyncClient) -> None:
    # The site's addresses are public constants in the frontend; nothing needs an API call to show them.
    assert (await anonymous.get(f"{API}/contact")).status_code == 405


async def test_operators_can_read_what_wasnt_emailed(
    anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession]
) -> None:
    from app.db import contact_requests

    await anonymous.post(f"{API}/contact", json=MESSAGE)
    use_email(FakeEmail())
    await anonymous.post(f"{API}/contact", json={**MESSAGE, "name": "Tom Ito", "company": None, "topic": "support"})
    async with sessions() as session:
        assert [row.name for row in await contact_requests.newest(session, 10)] == ["Tom Ito", "Priya Nair"]
        [waiting] = await contact_requests.newest(session, 10, not_emailed=True)
    shown = contact_requests.describe(waiting)
    assert "[Business inquiry]  not emailed" in shown
    assert "From: Priya Nair <priya@northwind.example>, Northwind Labs" in shown
    assert f"Subject: {MESSAGE['subject']}" in shown and MESSAGE["message"] in shown


def test_quiet_addresses_are_forgotten(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core import rate_limit

    monkeypatch.setattr(rate_limit, "MAX_CLIENTS", 3)
    clock = iter(float(second) for second in (0, 0, 0, 0, 100, 100))
    monkeypatch.setattr(rate_limit.time, "monotonic", lambda: next(clock))
    limiter = rate_limit.RateLimiter(1, 10, "Wait.")
    for client in ("a", "b", "c", "d"):  # the fourth is one too many to keep: none is old enough to drop yet
        assert limiter.allow(client)
    assert limiter.allow("e") and set(limiter._seen) == {"e"}  # later, the quiet ones go
    assert not limiter.allow("e")
