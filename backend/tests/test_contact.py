"""The public website's contact form: every message is kept, and emailed to the team when that's set up."""

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
    "topic": "pilot",
    "message": "We'd like to try TalentBridge with our next three hires.",
}


async def test_without_a_contact_address_none_is_shown(anonymous: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "contact_email", None)
    info = (await anonymous.get(f"{API}/contact")).json()
    assert info == {"email": None, "topics": ["product", "pilot", "support", "partnerships", "general"]}
    monkeypatch.setattr(settings, "contact_email", "hello@talentbridge.example")
    assert (await anonymous.get(f"{API}/contact")).json()["email"] == "hello@talentbridge.example"


async def test_a_message_is_kept_even_without_email(
    anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "contact_email", None)
    sent = await anonymous.post(f"{API}/contact", json=MESSAGE)
    assert sent.status_code == 200 and sent.json() == {"received": True}
    async with sessions() as session:
        [row] = (await session.scalars(select(ContactRequest))).all()
    assert (row.email, row.topic, row.company, row.email_status) == (
        "priya@northwind.example",
        "pilot",
        "Northwind Labs",
        "not_configured",
    )


async def test_with_email_set_up_the_team_gets_it(
    anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "contact_email", "hello@talentbridge.example")
    mail = use_email(FakeEmail())
    assert (await anonymous.post(f"{API}/contact", json=MESSAGE)).status_code == 200
    [email] = mail.sent
    assert (email.to, email.subject) == (
        "hello@talentbridge.example",
        "[Pilot / design partnership] Priya Nair, Northwind Labs",
    )
    assert "From: Priya Nair <priya@northwind.example>" in email.text and MESSAGE["message"] in email.text
    async with sessions() as session:
        assert (await session.scalar(select(ContactRequest.email_status))) == "sent"


async def test_the_form_is_checked(anonymous: AsyncClient) -> None:
    for bad in ({"email": "nope"}, {"topic": "sales"}, {"message": ""}, {"name": ""}, {"message": "x" * 5001}):
        assert (await anonymous.post(f"{API}/contact", json={**MESSAGE, **bad})).status_code == 422


async def test_form_fillers_are_ignored_and_floods_slowed(
    anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession]
) -> None:
    bot = await anonymous.post(f"{API}/contact", json={**MESSAGE, "website": "https://spam.example"})
    assert bot.status_code == 200
    async with sessions() as session:
        assert (await session.scalars(select(ContactRequest))).all() == []
    for _ in range(contact_service.PER_WINDOW):
        assert (await anonymous.post(f"{API}/contact", json=MESSAGE)).status_code == 200
    slowed = await anonymous.post(f"{API}/contact", json=MESSAGE)
    assert slowed.status_code == 429 and slowed.json()["error"]["code"] == "too_many_messages"
    # Someone else isn't held up by it.
    other = await anonymous.post(f"{API}/contact", json=MESSAGE, headers={"X-Forwarded-For": "203.0.113.9"})
    assert other.status_code == 200


async def test_operators_can_read_what_wasnt_emailed(
    anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession], monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.db import contact_requests

    monkeypatch.setattr(settings, "contact_email", None)
    await anonymous.post(f"{API}/contact", json=MESSAGE)
    monkeypatch.setattr(settings, "contact_email", "hello@talentbridge.example")
    use_email(FakeEmail())
    await anonymous.post(f"{API}/contact", json={**MESSAGE, "name": "Tom Ito", "company": None, "topic": "support"})
    async with sessions() as session:
        assert [row.name for row in await contact_requests.newest(session, 10)] == ["Tom Ito", "Priya Nair"]
        [waiting] = await contact_requests.newest(session, 10, not_emailed=True)
    shown = contact_requests.describe(waiting)
    assert "[Pilot / design partnership]  not emailed" in shown
    assert "From: Priya Nair <priya@northwind.example>, Northwind Labs" in shown and MESSAGE["message"] in shown
