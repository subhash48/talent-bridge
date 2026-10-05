"""Voluntary demographic information: optional for candidates, aggregate-only for recruiters, and never
part of anything that ranks, filters, evaluates or describes a person."""

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
from tests.conftest import ALEX_AUTH, API, SOPHIA_AUTH, application_id, bearer, candidate_id
from tests.test_demo_careers import EMAIL, apply_to, demo_job, demo_on  # noqa: F401  (demo_on: autouse here too)

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


# The candidate's own answers


async def test_a_candidate_can_answer_change_and_clear_their_answers(client: AsyncClient) -> None:
    empty = (await client.get(f"{API}/candidate/demographics")).json()
    assert empty == {
        "region": None,
        "race_ethnicity": None,
        "disability_status": None,
        "sexual_orientation": None,
        "updated_at": None,
    }

    saved = await client.put(f"{API}/candidate/demographics", json=ANSWERS)
    assert saved.status_code == 200
    assert {key: saved.json()[key] for key in ANSWERS} == ANSWERS

    partial = await client.put(f"{API}/candidate/demographics", json={"region": "prefer_not_to_say"})
    assert partial.json()["region"] == "prefer_not_to_say"
    assert partial.json()["race_ethnicity"] is None  # a PUT replaces: left out is unanswered

    cleared = await client.put(f"{API}/candidate/demographics", json={})
    assert cleared.json()["region"] is None


async def test_answers_are_validated_and_nothing_else_is_accepted(client: AsyncClient) -> None:
    assert (await client.put(f"{API}/candidate/demographics", json={"region": "mars"})).status_code == 422
    assert (await client.put(f"{API}/candidate/demographics", json={"name": "Sophia"})).status_code == 422


async def test_only_the_candidate_can_reach_their_own_answers(
    anonymous: AsyncClient, client: AsyncClient, sessions: async_sessionmaker[AsyncSession]
) -> None:
    await client.put(f"{API}/candidate/demographics", json=ANSWERS)
    recruiter = bearer(ALEX_AUTH)
    assert (await anonymous.get(f"{API}/candidate/demographics", headers=recruiter)).status_code == 403
    assert (await anonymous.put(f"{API}/candidate/demographics", json={}, headers=recruiter)).status_code == 403
    assert (await anonymous.get(f"{API}/candidate/demographics")).status_code == 401
    # No recruiter route takes a candidate and returns their answers: there is none to ask.
    paths = {path for path in app.openapi()["paths"] if "demographic" in path}
    assert paths == {f"{API}/candidate/demographics", f"{API}/analytics/demographics"}


async def test_no_recruiter_view_of_a_person_carries_their_answers(
    client: AsyncClient, sessions: async_sessionmaker[AsyncSession]
) -> None:
    """Candidate list, search, detail, interviews, messages and the AI's context: none of them."""
    await client.put(f"{API}/candidate/demographics", json=ANSWERS)
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


# The demo careers application form


async def test_answers_given_with_a_careers_application_move_to_the_candidate_on_submit(
    anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession], ashby: FakeSupabaseAdmin
) -> None:
    job = await demo_job(sessions)
    response = await apply_to(anonymous, job, demographics={"region": "canada", "race_ethnicity": "prefer_not_to_say"})
    assert response.status_code == 200
    async with sessions() as session:
        assert await session.scalar(select(func.count()).select_from(DemoApplicationDemographics)) == 1
        assert await session.scalar(select(func.count()).select_from(CandidateDemographics)) == 0

    token = bearer(ashby.users[EMAIL], email=EMAIL)
    assert (await anonymous.get(f"{API}/me", headers=token)).status_code == 200  # activating submits it

    async with sessions() as session:
        assert await session.scalar(select(func.count()).select_from(DemoApplicationDemographics)) == 0
        candidate = await session.scalar(select(Candidate.id).where(Candidate.email == EMAIL))
        row = await session.get(CandidateDemographics, candidate)
        assert row is not None
        assert (row.region, row.race_ethnicity, row.disability_status) == ("canada", "prefer_not_to_say", None)
    own = (await anonymous.get(f"{API}/candidate/demographics", headers=token)).json()
    assert own["region"] == "canada"


async def test_a_careers_application_needs_no_demographic_answers(
    anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession], ashby: FakeSupabaseAdmin
) -> None:
    job = await demo_job(sessions)
    assert (await apply_to(anonymous, job)).status_code == 200
    assert (await apply_to(anonymous, job, demographics={})).status_code == 200
    assert (
        await apply_to(anonymous, job, demographics={"region": None, "sexual_orientation": "prefer_not_to_say"})
    ).status_code == 200
    assert (await apply_to(anonymous, job, demographics={"region": "atlantis"})).status_code == 422
    await anonymous.get(f"{API}/me", headers=bearer(ashby.users[EMAIL], email=EMAIL))
    async with sessions() as session:
        rows = (await session.scalars(select(CandidateDemographics))).all()
    assert [(row.region, row.sexual_orientation) for row in rows] == [(None, "prefer_not_to_say")]
