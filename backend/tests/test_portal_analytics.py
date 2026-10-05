"""Candidate portal analytics: what the portal records, how the numbers are calculated from it, who can
see them, and the insights written from them."""

import uuid

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models import CandidateEngagementEvent
from tests.conftest import API, application_id

SOPHIA_APP = application_id("sophia-martinez")


# What the portal records


async def test_section_views_are_recorded_once_however_often_they_are_sent(
    client: AsyncClient, sessions: async_sessionmaker[AsyncSession]
) -> None:
    """A rerender that sends the same view twice, or a reload, records it once."""
    visit_id = str(uuid.uuid4())
    await client.post(
        f"{API}/candidate/engagement/sessions", json={"session_id": visit_id, "application_id": SOPHIA_APP}
    )
    view = {
        "type": "company_section_viewed",
        "application_id": SOPHIA_APP,
        "session_id": visit_id,
        "section": "benefits",
    }
    page = {"type": "page_view", "application_id": SOPHIA_APP, "session_id": visit_id, "page": "company"}
    for _ in range(2):
        response = await client.post(f"{API}/candidate/engagement/events", json={"events": [view, view, page, page]})
        assert response.status_code == 204
    async with sessions() as session:
        rows = (
            await session.execute(
                select(CandidateEngagementEvent.event_type, CandidateEngagementEvent.meta).where(
                    CandidateEngagementEvent.event_type.in_(["company_section_viewed", "page_view"])
                )
            )
        ).all()
    assert sorted((event_type, meta["target"]) for event_type, meta in rows) == [
        ("company_section_viewed", "benefits"),
        ("page_view", "company"),
    ]
    # A section view without a section, or with one the page doesn't have, records nothing.
    missing = {"type": "company_section_viewed", "application_id": SOPHIA_APP}
    assert (await client.post(f"{API}/candidate/engagement/events", json={"events": [missing]})).status_code == 204
    wrong = {**view, "section": "salaries"}
    assert (await client.post(f"{API}/candidate/engagement/events", json={"events": [wrong]})).status_code == 422
    # The portal can't claim a question was asked: the server records that itself.
    asked = {"type": "ai_question_asked", "application_id": SOPHIA_APP}
    assert (await client.post(f"{API}/candidate/engagement/events", json={"events": [asked]})).status_code == 422
