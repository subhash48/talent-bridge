"""Engagement end to end: what the portal reports, what recruiters see, what nobody else does."""

import dataclasses
import json
import uuid
from datetime import timedelta

import httpx
import pytest
from httpx import AsyncClient
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.main import app
from app.models import CandidateEngagementEvent, PortalSession
from app.models.base import utcnow
from app.services.ai.client import get_ai_provider
from app.services.ai.context import CandidateContext
from app.services.ai.groq import GroqProvider
from tests.ashby_support import application_event, deliver
from tests.conftest import API, SOPHIA_AUTH, application_id, bearer, candidate_id

SOPHIA = candidate_id("sophia-martinez")
SOPHIA_APP = application_id("sophia-martinez")
JAMES_APP = application_id("james-park")


def visit(session_id: uuid.UUID | None = None) -> dict[str, str]:
    return {"session_id": str(session_id or uuid.uuid4()), "application_id": SOPHIA_APP}


async def portal_row(sessions: async_sessionmaker[AsyncSession], visit_id: str) -> PortalSession:
    async with sessions() as session:
        row = await session.scalar(select(PortalSession).where(PortalSession.client_session_id == uuid.UUID(visit_id)))
        assert row is not None
        return row


async def rewind(sessions: async_sessionmaker[AsyncSession], visit_id: str, seconds: int) -> None:
    """Pretend the last heartbeat was this long ago."""
    async with sessions() as session:
        await session.execute(
            update(PortalSession)
            .where(PortalSession.client_session_id == uuid.UUID(visit_id))
            .values(last_active_at=utcnow() - timedelta(seconds=seconds))
        )
        await session.commit()


async def events(sessions: async_sessionmaker[AsyncSession], event_type: str) -> int:
    async with sessions() as session:
        return await session.scalar(
            select(func.count()).select_from(CandidateEngagementEvent).where(CandidateEngagementEvent.event_type == event_type)
        ) or 0


# What the portal reports


async def test_a_visit_starts_once_and_logs_in_once(client: AsyncClient, sessions: async_sessionmaker[AsyncSession]) -> None:
    body = visit()
    token = bearer(SOPHIA_AUTH, session_id="auth-session-1")
    for _ in range(2):
        assert (await client.post(f"{API}/candidate/engagement/sessions", json=body, headers=token)).status_code == 204
    other_tab = visit()
    await client.post(f"{API}/candidate/engagement/sessions", json=other_tab, headers=token)
    assert await events(sessions, "portal_session_started") == 2  # two tabs
    assert await events(sessions, "portal_login") == 1  # one sign-in
    await client.post(f"{API}/candidate/engagement/sessions", json=visit(), headers=bearer(SOPHIA_AUTH, session_id="auth-session-2"))
    assert await events(sessions, "portal_login") == 2


async def test_heartbeats_count_only_visible_active_time(
    client: AsyncClient, sessions: async_sessionmaker[AsyncSession]
) -> None:
    body = visit()
    await client.post(f"{API}/candidate/engagement/sessions", json=body)

    await rewind(sessions, body["session_id"], 30)
    assert (await client.post(f"{API}/candidate/engagement/heartbeat", json=body)).status_code == 204
    assert (await portal_row(sessions, body["session_id"])).active_seconds == 30

    # Sent again straight away (a duplicate): nothing more.
    await client.post(f"{API}/candidate/engagement/heartbeat", json=body)
    assert (await portal_row(sessions, body["session_id"])).active_seconds == 30

    # The tab was hidden for ten minutes: the gap counts for nothing.
    await rewind(sessions, body["session_id"], 600)
    await client.post(f"{API}/candidate/engagement/heartbeat", json=body)
    assert (await portal_row(sessions, body["session_id"])).active_seconds == 30

    await rewind(sessions, body["session_id"], 25)
    assert (await client.post(f"{API}/candidate/engagement/sessions/end", json=body)).status_code == 204
    row = await portal_row(sessions, body["session_id"])
    assert row.active_seconds == 55 and row.ended_at is not None


@pytest.mark.usefixtures("ashby")
async def test_time_on_one_application_never_counts_for_another(
    client: AsyncClient, anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession]
) -> None:
    payload = application_event(
        application_id=str(uuid.uuid4()), email="sophia.martinez@example.com", name="Sophia Martinez",
        job_id=str(uuid.uuid4()), job_title="Design Systems Lead",
    )  # fmt: skip
    await deliver(anonymous, payload)
    other = next(
        item["id"]
        for item in (await client.get(f"{API}/candidate/applications")).json()
        if item["job_title"] == "Design Systems Lead"
    )
    tab = str(uuid.uuid4())  # one browser tab, switching between the two
    for app_id in (SOPHIA_APP, other):
        body = {"session_id": tab, "application_id": app_id}
        await client.post(f"{API}/candidate/engagement/sessions", json=body)
    body = {"session_id": tab, "application_id": other}
    await rewind(sessions, tab, 45)  # both rows of the tab; only the one heartbeated gets the time
    await client.post(f"{API}/candidate/engagement/heartbeat", json=body)

    async with sessions() as session:
        rows = {
            str(row.application_id): row.active_seconds
            for row in await session.scalars(select(PortalSession).where(PortalSession.client_session_id == uuid.UUID(tab)))
        }
    assert rows == {SOPHIA_APP: 0, other: 45}
    product = (await client.get(f"{API}/candidates/{SOPHIA}/engagement", params={"application_id": SOPHIA_APP})).json()
    lead = (await client.get(f"{API}/candidates/{SOPHIA}/engagement", params={"application_id": other})).json()
    assert lead["portal_activity"]["sessions"] == 1 and product["portal_activity"]["sessions"] == 5
    assert product["overall"]["visits"] == 5  # the same tab is one visit overall


async def test_events_are_validated_and_throttled(client: AsyncClient, sessions: async_sessionmaker[AsyncSession]) -> None:
    body = visit()
    await client.post(f"{API}/candidate/engagement/sessions", json=body)
    page = {"type": "page_view", "application_id": SOPHIA_APP, "page": "dashboard", "session_id": body["session_id"]}
    batch = {"events": [page, page, {"type": "application_viewed", "application_id": SOPHIA_APP}]}
    viewed = await events(sessions, "application_viewed")  # the seed has an older one
    assert (await client.post(f"{API}/candidate/engagement/events", json=batch)).status_code == 204
    assert (await client.post(f"{API}/candidate/engagement/events", json=batch)).status_code == 204  # a refresh
    assert await events(sessions, "page_view") == 1
    assert await events(sessions, "application_viewed") == viewed + 1
    assert (await portal_row(sessions, body["session_id"])).page_views == 1

    # Only portal actions may be sent, about the candidate's own applications, with nothing extra.
    for bad in (
        {"type": "portal_login", "application_id": SOPHIA_APP},
        {"type": "prep_viewed", "application_id": SOPHIA_APP},
        {"type": "keystroke", "application_id": SOPHIA_APP},
        {"type": "page_view", "application_id": SOPHIA_APP, "candidate_id": SOPHIA},
        {"type": "page_view", "application_id": SOPHIA_APP, "page": "settings-of-another-site"},
    ):
        response = await client.post(f"{API}/candidate/engagement/events", json={"events": [bad]})
        assert response.status_code == 422, bad
    assert (await client.post(f"{API}/candidate/engagement/events", json={"events": []})).status_code == 422
    too_many = {"events": [page] * 21}
    assert (await client.post(f"{API}/candidate/engagement/events", json=too_many)).status_code == 422
    foreign = {"events": [{"type": "application_viewed", "application_id": JAMES_APP}]}
    assert (await client.post(f"{API}/candidate/engagement/events", json=foreign)).status_code == 404


async def test_an_interview_view_must_be_of_her_own_interview(
    client: AsyncClient, sessions: async_sessionmaker[AsyncSession]
) -> None:
    james_interview = (await client.get(f"{API}/applications/{JAMES_APP}/interviews")).json()[0]["id"]
    own = (await client.get(f"{API}/candidate/interviews")).json()[1]["id"]
    for interview in (james_interview, own):
        payload = {"events": [{"type": "interview_viewed", "application_id": SOPHIA_APP, "interview_id": interview}]}
        assert (await client.post(f"{API}/candidate/engagement/events", json=payload)).status_code == 204
    async with sessions() as session:
        targets = [
            (meta or {}).get("target")
            for meta in await session.scalars(
                select(CandidateEngagementEvent.meta).where(CandidateEngagementEvent.event_type == "interview_viewed")
            )
        ]
    assert own in targets and james_interview not in targets


async def test_server_records_prep_and_message_reads(client: AsyncClient, sessions: async_sessionmaker[AsyncSession]) -> None:
    before = await events(sessions, "prep_viewed")
    await client.post(f"{API}/candidate/prep/viewed")
    await client.post(f"{API}/candidate/prep/viewed")
    assert await events(sessions, "prep_viewed") == before + 1

    await client.post(f"{API}/applications/{SOPHIA_APP}/messages", json={"content": "See you tomorrow!"})
    reads = await events(sessions, "message_read")
    await client.post(f"{API}/candidate/messages/read")
    await client.post(f"{API}/candidate/messages/read")  # nothing new to read: not another event
    assert await events(sessions, "message_read") == reads + 1


# What recruiters see


async def test_recruiter_breakdown(client: AsyncClient) -> None:
    response = await client.get(f"{API}/candidates/{SOPHIA}/engagement")
    assert response.status_code == 200
    breakdown = response.json()
    assert breakdown["application_id"] == SOPHIA_APP
    assert breakdown["level"] == "high" and breakdown["label"] == "High engagement" and breakdown["sufficient_data"]
    parts = [breakdown[part] for part in ("portal_activity", "responsiveness", "communication")]
    assert breakdown["score"] == sum(part["score"] for part in parts)
    assert [part["max"] for part in parts] == [30, 40, 30]
    assert breakdown["portal_activity"]["sessions"] == 4 and breakdown["portal_activity"]["active_minutes"] == 26
    assert breakdown["responsiveness"]["responses"] == 4  # two replies and two confirmations
    assert breakdown["communication"]["confirmations"] == 2
    assert breakdown["overall"]["visits"] == 4
    assert breakdown["portal_access"]["status"] in ("invited", "active")
    assert breakdown["recent_portal_activity"][0]["label"] == "Read your messages"
    assert "not a measure of candidate quality" in breakdown["note"]

    row = (await client.get(f"{API}/candidates", params={"search": "Sophia"})).json()["items"][0]
    assert row["engagement"]["score"] == breakdown["score"] and row["engagement"]["last_active_at"]

    assert (await client.get(f"{API}/candidates/{SOPHIA}/engagement", params={"application_id": JAMES_APP})).status_code == 404


async def test_portal_actions_reach_the_recruiter(client: AsyncClient) -> None:
    before = (await client.get(f"{API}/candidates/{SOPHIA}/engagement")).json()
    await client.post(f"{API}/applications/{SOPHIA_APP}/messages", json={"content": "Quick question for you."})
    await client.post(f"{API}/candidate/messages", json={"content": "Happy to help!"})
    await client.post(f"{API}/candidate/messages", json={"content": "Thank you for today.", "kind": "thank_you"})
    await client.post(f"{API}/candidate/messages", json={"content": "Any update?", "kind": "follow_up"})
    after = (await client.get(f"{API}/candidates/{SOPHIA}/engagement")).json()
    assert after["responsiveness"]["responses"] == before["responsiveness"]["responses"] + 1
    assert after["communication"]["thank_you_notes"] == 1 and after["communication"]["follow_ups"] == 1
    assert after["proactive_actions"] == before["proactive_actions"] + 2
    timeline = [entry["title"] for entry in (await client.get(f"{API}/applications/{SOPHIA_APP}/activity")).json()[:3]]
    assert timeline == ["Sent a follow-up", "Sent a thank-you note", "Replied to message"]


async def test_candidates_never_see_engagement(client: AsyncClient) -> None:
    assert (await client.get(f"{API}/candidates/{SOPHIA}/engagement", headers=bearer(SOPHIA_AUTH))).status_code == 403
    portal = json.dumps([(await client.get(f"{API}/candidate/{path}")).json() for path in ("me", "applications", "application")])
    for internal in ("engagement", "score", "sufficient_data", "active_minutes", "High engagement"):
        assert internal not in portal, internal


# What the AI never sees


def test_the_recruiter_ai_context_has_no_engagement_field() -> None:
    fields = {field.name for field in dataclasses.fields(CandidateContext)}
    assert not {name for name in fields if "engagement" in name or "score" in name}


async def test_engagement_never_reaches_the_qualification_prompt(client: AsyncClient) -> None:
    prompts: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        prompts.append(request.content.decode())
        analysis = {
            "summary": "Strong design systems background.",
            "skills_matched": [],
            "missing_skills": [],
            "strengths": [],
            "concerns": [],
            "suggested_questions": [],
            "recommended_next_step": "Brief the panel.",
        }
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(analysis)}}]})

    app.dependency_overrides[get_ai_provider] = lambda: GroqProvider(
        api_key="k", model="llama", transport=httpx.MockTransport(handler)
    )
    breakdown = (await client.get(f"{API}/candidates/{SOPHIA}/engagement")).json()
    for path in ("analyze-candidate", "ask-candidate", "draft-message"):
        body = {"application_id": SOPHIA_APP, "message": "Summarise her", "purpose": "follow_up"}
        assert (await client.post(f"{API}/ai/{path}", json=body)).status_code in (200, 201)
    assert len(prompts) == 3
    for prompt in prompts:
        lowered = prompt.lower()
        assert "engagement:" not in lowered and "high engagement" not in lowered
        assert f"{breakdown['score']} / 100" not in prompt and "portal visits" not in lowered
        assert "active minutes" not in lowered and "response time" not in lowered


@pytest.mark.parametrize("path", ["/candidate/engagement/heartbeat", "/candidate/engagement/sessions"])
async def test_recruiters_cannot_post_portal_activity(anonymous: AsyncClient, path: str) -> None:
    from tests.conftest import ALEX_AUTH

    response = await anonymous.post(f"{API}{path}", json=visit(), headers=bearer(ALEX_AUTH))
    assert response.status_code == 403


def test_repeated_portal_actions_are_listed_once_with_a_count() -> None:
    from app.services.engagement.breakdown import RECENT_ACTIONS, recent_actions

    now = utcnow()
    kinds = ["portal_login"] * 3 + ["interview_viewed", "portal_login"] + ["prep_viewed", "message_read"] * 10
    events = [
        CandidateEngagementEvent(event_type=kind, occurred_at=now - timedelta(minutes=index)) for index, kind in enumerate(kinds)
    ]
    actions = recent_actions(events)
    assert [(action.label, action.count) for action in actions[:3]] == [
        ("Signed in to the portal", 3),
        ("Viewed interview details", 1),
        ("Signed in to the portal", 1),
    ]
    assert actions[0].occurred_at == now  # the latest of the run
    assert len(actions) == RECENT_ACTIONS
