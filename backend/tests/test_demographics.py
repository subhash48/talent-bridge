"""Voluntary demographic information. TalentBridge no longer collects it: no form or endpoint asks for
it. Answers given before stay in their own table, aggregate-only for recruiters and never part of
anything that ranks, filters, evaluates or describes a person."""

import json
import re
import uuid
from collections import Counter
from typing import Any

from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.enums import Region
from app.main import app
from app.models import Candidate, CandidateDemographics, DemoApplicationDemographics
from app.models.base import utcnow
from app.services.ai.context import build_candidate_context
from app.services.demographics import MIN_GROUP_SIZE, OTHER_INSUFFICIENT, summarize
from tests.ashby_support import FakeSupabaseAdmin
from tests.conftest import API, SOPHIA_AUTH, application_id, bearer, candidate_id
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
    paths = {path for path in app.openapi()["paths"] if "demographic" in path}
    assert paths == {f"{API}/analytics/demographics"}  # aggregates of answers given before
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
            organization="Encord",
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


async def test_recruiters_see_aggregates_with_small_groups_combined(
    client: AsyncClient, sessions: async_sessionmaker[AsyncSession]
) -> None:
    answers = (
        [{"region": "united_states", "race_ethnicity": "white"}] * 9
        + [{"region": "india", "race_ethnicity": "asian"}] * 6
        + [{"region": "canada", "race_ethnicity": "black"}] * 2  # too few to show
        + [{"region": "germany", "race_ethnicity": "asian", "disability_status": "yes"}] * 1
        + [{"region": "prefer_not_to_say"}] * 5
    )
    await answer_for_many(sessions, answers)
    response = await client.get(f"{API}/analytics/demographics")
    assert response.status_code == 200
    summary = response.json()
    assert summary["min_group_size"] == MIN_GROUP_SIZE
    region = next(d for d in summary["dimensions"] if d["dimension"] == "region")
    assert region["respondents_approx"] == 20  # 23, rounded down to a multiple of 5
    shares = {bucket["key"]: bucket["share"] for bucket in region["buckets"]}
    # Canada (2) and Germany (1) are too few, and so is the 3 they'd make together: the next-smallest
    # group (prefer not to say, 5) joins them, so none of the three can be worked out.
    assert shares == {"united_states": 39, "india": 26, OTHER_INSUFFICIENT: 35}

    # Disability: one answer in all. Nothing is reported.
    disability = next(d for d in summary["dimensions"] if d["dimension"] == "disability_status")
    assert disability["suppressed"] is True and disability["buckets"] == []

    # Nothing about any person in the response: no ids, names or emails.
    text = json.dumps(summary).lower()
    async with sessions() as session:
        people = (await session.execute(select(Candidate.id, Candidate.email, Candidate.last_name))).all()
    for candidate, email, last_name in people:
        assert str(candidate) not in text and email not in text and last_name.lower() not in text


def test_a_combined_group_too_small_to_stand_alone_takes_in_the_next_smallest() -> None:
    # Bisexual (3) alone would identify three people; combined with lesbian (5) it can't be subtracted out.
    counts = Counter({"straight": 40, "lesbian": 5, "bisexual": 3})
    dimension = summarize("sexual_orientation", "Sexual orientation", counts)
    assert [(bucket.key, bucket.share) for bucket in dimension.buckets] == [("straight", 83), (OTHER_INSUFFICIENT, 17)]
    # Region's own "Other" absorbs small groups and keeps its name when nothing was hidden.
    other = summarize("region", "Region", Counter({"united_states": 10, "other": 6}), residual=Region.OTHER)
    assert [bucket.label for bucket in other.buckets] == ["United States", "Other"]
    # Too few answers in all: nothing at all.
    assert summarize("region", "Region", Counter({"india": 4})).suppressed


async def test_candidates_cant_read_the_aggregates(anonymous: AsyncClient) -> None:
    assert (await anonymous.get(f"{API}/analytics/demographics", headers=bearer(SOPHIA_AUTH))).status_code == 403
