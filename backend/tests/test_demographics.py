"""Voluntary demographic information. TalentBridge no longer collects or shows it: no form or endpoint
asks for it, and no page reports it. Answers given before stay in their own table, untouched, and are
never part of anything that ranks, filters, evaluates or describes a person."""

import json
import re
import uuid
from typing import Any

from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.main import app
from app.models import Candidate, CandidateDemographics, DemoApplicationDemographics
from app.models.base import utcnow
from app.services.ai.context import build_candidate_context
from tests.ashby_support import FakeSupabaseAdmin
from tests.conftest import API, application_id, candidate_id
from tests.test_demo_careers import apply_to, demo_job, demo_on  # noqa: F401  (demo_on: autouse here too)

SOPHIA = candidate_id("sophia-martinez")
ANSWERS = {
    "region": "india",
    "race_ethnicity": "asian",
    "disability_status": "prefer_not_to_say",
    "sexual_orientation": "bisexual",
}
SENSITIVE_VALUES = ("asian", "bisexual", "prefer_not_to_say", "india")


async def answer_for_many(sessions: async_sessionmaker[AsyncSession], answers: list[dict[str, Any]]) -> None:
    """Give demographic answers to as many seeded candidates as there are answers."""
    async with sessions() as session:
        ids = (await session.scalars(select(Candidate.id).order_by(Candidate.email))).all()
        for candidate, values in zip(ids, answers, strict=False):
            session.add(CandidateDemographics(candidate_id=candidate, **values))
        await session.commit()


# Nothing collects them any more


async def test_no_endpoint_or_form_collects_answers(
    anonymous: AsyncClient, client: AsyncClient, sessions: async_sessionmaker[AsyncSession], ashby: FakeSupabaseAdmin
) -> None:
    assert (await client.get(f"{API}/candidate/demographics")).status_code == 404
    assert (await client.put(f"{API}/candidate/demographics", json=ANSWERS)).status_code in (404, 405)
    assert not [path for path in app.openapi()["paths"] if "demographic" in path]
    # A careers form that still sends answers is taken, and the answers are dropped.
    job = await demo_job(sessions)
    assert (await apply_to(anonymous, job, demographics=ANSWERS)).status_code == 200
    async with sessions() as session:
        assert await session.scalar(select(func.count()).select_from(DemoApplicationDemographics)) == 0
        assert await session.scalar(select(func.count()).select_from(CandidateDemographics)) == 0


async def test_no_recruiter_view_of_a_person_carries_their_answers(
    client: AsyncClient, sessions: async_sessionmaker[AsyncSession]
) -> None:
    """Candidate list, search, detail, interviews, messages and the AI's context: none of them."""
    async with sessions() as session:
        session.add(CandidateDemographics(candidate_id=uuid.UUID(SOPHIA), **ANSWERS))
        await session.commit()
    responses = [
        await client.get(f"{API}/candidates"),
        await client.get(f"{API}/candidates", params={"search": "Asian"}),
        await client.get(f"{API}/candidates/{SOPHIA}"),
        await client.get(f"{API}/interviews"),
        await client.get(f"{API}/messages/conversations"),
        await client.get(f"{API}/applications/{application_id('sophia-martinez')}/messages"),
    ]
    for response in responses:
        assert response.status_code == 200
        text = json.dumps(response.json()).lower()
        assert not re.search(r"\b(race|ethnicity|disability|orientation|demographic\w*)\b", text), response.url
    # Search doesn't match on answers: nobody seeded is "bisexual" by name, job, skill or location.
    assert (await client.get(f"{API}/candidates", params={"search": "bisexual"})).json()["total"] == 0

    async with sessions() as session:
        context = await build_candidate_context(
            session,
            uuid.UUID(application_id("sophia-martinez")),
            recruiter_name="Alex Chen",
            now=utcnow(),
        )
    prompt = context.to_prompt().lower()
    assert "bisexual" not in prompt and "asian" not in prompt and "disab" not in prompt


async def test_answers_never_change_the_pipeline_order(
    client: AsyncClient, sessions: async_sessionmaker[AsyncSession]
) -> None:
    before = [
        item["application_id"]
        for item in (await client.get(f"{API}/candidates", params={"limit": 200})).json()["items"]
    ]
    await answer_for_many(sessions, [ANSWERS] * 20 + [{"race_ethnicity": "white"}] * 12)
    after = [
        item["application_id"]
        for item in (await client.get(f"{API}/candidates", params={"limit": 200})).json()["items"]
    ]
    assert after == before


# Aggregates
