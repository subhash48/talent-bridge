"""The candidate portal: Sophia Martinez's view of her own application.

Covers the /candidate endpoints, the shared state between the two portals, and the privacy
boundary: nothing a recruiter records internally may reach the candidate or the candidate AI.
"""

import json
import uuid
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import settings
from app.models import Candidate
from app.services import candidate_portal_service
from app.services.ai.gemini import GeminiProvider
from app.services.candidate_ai_service import build_portal_context
from tests.conftest import API, application_id, candidate_id

SOPHIA_APP = application_id("sophia-martinez")
SOPHIA = candidate_id("sophia-martinez")
JAMES_APP = application_id("james-park")

# Recruiter-only text in the seed: Maya's portfolio review feedback.
FEEDBACK = "Strong design systems thinking"


def in_days(days: int) -> str:
    return (datetime.now(UTC) + timedelta(days=days)).isoformat()


async def portal_snapshot(client: AsyncClient) -> str:
    """Every candidate-facing read, as one string, for leak checks."""
    responses = [
        await client.get(f"{API}/candidate/{path}")
        for path in ("me", "application", "activity", "interviews", "messages", "profile", "prep")
    ]
    assert all(response.status_code == 200 for response in responses)
    return json.dumps([response.json() for response in responses])


# Reads


async def test_me_is_sophias_application(client: AsyncClient) -> None:
    response = await client.get(f"{API}/candidate/me")
    assert response.status_code == 200
    me = response.json()
    assert me["company"] == "Encord"
    assert me["candidate"]["full_name"] == "Sophia Martinez"
    assert me["job"]["title"] == "Product Designer"
    assert me["job"]["department"] == "Design"
    assert me["application"]["stage"] == "interview"
    assert me["application"]["status"] == "active"
    states = {step["label"]: step["state"] for step in me["application"]["steps"]}
    assert states == {
        "Applied": "complete",
        "Screening": "complete",
        "Interview": "current",
        "Offer": "upcoming",
        "Hired": "upcoming",
    }
    assert me["next_interview"]["title"] == "Design interview"
    assert me["next_interview"]["interviewers"] == ["Maya Okafor", "Leo Brandt"]
    assert me["next_interview"]["meeting_url"]
    assert me["recruiter"] == {"name": "Alex Chen", "email": "alex.chen@encord.example", "title": "Recruiter"}
    # Sophia replied to both of Alex's messages, so she has read them.
    assert me["unread_messages"] == 0
    assert me["latest_message"]["sender_type"] == "recruiter"
    assert me["recent_activity"][0]["title"] == "You confirmed your interview"


async def test_application_detail_and_timeline(client: AsyncClient) -> None:
    detail = (await client.get(f"{API}/candidate/application")).json()
    assert detail["job"]["description"].startswith("Design the workflows")
    assert detail["recruiter"]["name"] == "Alex Chen"
    titles = [entry["title"] for entry in detail["timeline"]]
    assert titles[0] == "Application submitted"
    assert "Moved to Screening" in titles and "Moved to Interview" in titles
    assert titles.index("Moved to Screening") < titles.index("Moved to Interview")
    assert detail["application"]["next_step"].startswith("Prepare for your Design interview")


async def test_interviews_hide_feedback_and_scope_to_the_candidate(client: AsyncClient) -> None:
    interviews = (await client.get(f"{API}/candidate/interviews")).json()
    assert [i["title"] for i in interviews] == ["Portfolio review", "Design interview"]
    review, design = interviews
    assert "notes" not in review
    assert review["status"] == "completed" and review["meeting_url"] is None and not review["upcoming"]
    assert design["upcoming"] and design["confirmed_at"] and not design["can_confirm"]

    one = await client.get(f"{API}/candidate/interviews/{design['id']}")
    assert one.status_code == 200 and one.json()["title"] == "Design interview"

    # Another candidate's interview doesn't exist as far as Sophia is concerned.
    james = (await client.get(f"{API}/applications/{JAMES_APP}/interviews")).json()[0]
    assert (await client.get(f"{API}/candidate/interviews/{james['id']}")).status_code == 404
    assert (await client.patch(f"{API}/candidate/interviews/{james['id']}/confirm")).status_code == 404


# Shared state with the recruiter workspace


async def test_recruiter_schedules_and_candidate_confirms(client: AsyncClient) -> None:
    scheduled = await client.post(
        f"{API}/applications/{SOPHIA_APP}/interviews",
        json={
            "title": "Team interview",
            "interview_type": "video",
            "scheduled_at": in_days(3),
            "duration_minutes": 45,
            "interviewers": ["Hannah Lee"],
            "meeting_url": "https://meet.example.com/team",
            "notes": "Probe stakeholder management; recruiter-only brief.",
        },
    )
    assert scheduled.status_code == 201
    interview_id = scheduled.json()["id"]

    # The candidate sees it at once, without the recruiter's notes.
    mine = {i["id"]: i for i in (await client.get(f"{API}/candidate/interviews")).json()}
    assert mine[interview_id]["can_confirm"] is True
    assert "recruiter-only brief" not in json.dumps(mine)
    activity = (await client.get(f"{API}/candidate/activity")).json()
    assert activity[0]["title"] == "Team interview scheduled"

    confirmed = await client.patch(f"{API}/candidate/interviews/{interview_id}/confirm")
    assert confirmed.status_code == 200
    assert confirmed.json()["confirmed_at"] and confirmed.json()["can_confirm"] is False
    again = await client.patch(f"{API}/candidate/interviews/{interview_id}/confirm")
    assert again.json()["confirmed_at"] == confirmed.json()["confirmed_at"]  # idempotent

    # The recruiter's schedule and timeline show the confirmation, recorded once.
    schedule = {i["id"]: i for i in (await client.get(f"{API}/interviews")).json()}
    assert schedule[interview_id]["confirmed_at"] == confirmed.json()["confirmed_at"]
    timeline = (await client.get(f"{API}/applications/{SOPHIA_APP}/activity")).json()
    assert timeline[0]["activity_type"] == "interview_confirmed"
    assert timeline[0]["metadata"]["via"] == "candidate_portal"
    assert (
        sum(1 for entry in timeline if entry["metadata"] and entry["metadata"].get("interview_id") == interview_id) == 2
    )
    pipeline = (await client.get(f"{API}/candidates", params={"search": "Sophia"})).json()["items"][0]
    assert pipeline["last_activity"]["title"] == "Confirmed interview"

    candidate_view = (await client.get(f"{API}/candidate/activity")).json()
    assert candidate_view[0]["title"] == "You confirmed the Team interview"


async def test_confirm_rejects_past_and_cancelled_interviews(client: AsyncClient) -> None:
    interviews = {i["title"]: i for i in (await client.get(f"{API}/candidate/interviews")).json()}
    past = await client.patch(f"{API}/candidate/interviews/{interviews['Portfolio review']['id']}/confirm")
    assert past.status_code == 400
    assert past.json()["error"]["code"] == "interview_in_past"

    design_id = interviews["Design interview"]["id"]
    assert (await client.patch(f"{API}/interviews/{design_id}", json={"status": "cancelled"})).status_code == 200
    cancelled = await client.patch(f"{API}/candidate/interviews/{design_id}/confirm")
    assert cancelled.status_code == 400
    assert cancelled.json()["error"]["code"] == "interview_cancelled"
    me = (await client.get(f"{API}/candidate/me")).json()
    assert me["next_interview"] is None  # a cancelled interview isn't upcoming


async def test_messages_flow_between_portals(client: AsyncClient) -> None:
    # The recruiter opens Sophia's thread (her last message was unread) and replies.
    assert (await client.post(f"{API}/applications/{SOPHIA_APP}/messages/read")).status_code == 204
    sent = await client.post(
        f"{API}/applications/{SOPHIA_APP}/messages", json={"content": "Looking forward to meeting you tomorrow."}
    )
    assert sent.status_code == 201

    thread = (await client.get(f"{API}/candidate/messages")).json()
    assert thread["unread"] == 1
    latest = thread["messages"][-1]
    assert latest["content"] == "Looking forward to meeting you tomorrow."
    assert latest["sender_type"] == "recruiter" and latest["sender_name"] == "Alex Chen"
    assert latest["read_at"] is None
    assert (await client.get(f"{API}/candidate/me")).json()["unread_messages"] == 1
    activity = (await client.get(f"{API}/candidate/activity")).json()
    assert activity[0]["title"] == "New message from Alex"

    assert (await client.post(f"{API}/candidate/messages/read")).status_code == 204
    assert (await client.get(f"{API}/candidate/messages")).json()["unread"] == 0

    before = (await client.get(f"{API}/messages/unread-count")).json()["count"]
    reply = await client.post(f"{API}/candidate/messages", json={"content": "Thank you, looking forward to it."})
    assert reply.status_code == 201
    assert reply.json()["sender_type"] == "candidate"

    # The recruiter's inbox shows the reply, unread.
    conversations = (await client.get(f"{API}/messages/conversations")).json()
    sophia = next(c for c in conversations if c["candidate"]["application_id"] == SOPHIA_APP)
    assert sophia["messages"][-1]["content"] == "Thank you, looking forward to it."
    assert sophia["unread"] == 1
    assert (await client.get(f"{API}/messages/unread-count")).json()["count"] == before + 1
    timeline = (await client.get(f"{API}/applications/{SOPHIA_APP}/activity")).json()
    assert timeline[0]["activity_type"] == "message_received"
    assert timeline[0]["title"] == "Replied to message"

    empty = await client.post(f"{API}/candidate/messages", json={"content": "   "})
    assert empty.status_code == 422


async def test_recruiter_stage_changes_reach_the_candidate(client: AsyncClient) -> None:
    moved = await client.patch(f"{API}/applications/{SOPHIA_APP}/stage", json={"stage": "offer"})
    assert moved.status_code == 200

    me = (await client.get(f"{API}/candidate/me")).json()
    assert me["application"]["stage"] == "offer"
    assert me["application"]["stage_label"] == "Offer"
    current = [step["label"] for step in me["application"]["steps"] if step["state"] == "current"]
    assert current == ["Offer"]
    assert me["recent_activity"][0]["title"] == "Moved to Offer"


async def test_closed_application_hides_the_reason(client: AsyncClient) -> None:
    reason = "Internal: compensation expectations above band"
    closed = await client.patch(f"{API}/applications/{SOPHIA_APP}/stage", json={"stage": "rejected", "reason": reason})
    assert closed.status_code == 200

    me = (await client.get(f"{API}/candidate/me")).json()
    assert me["application"]["status"] == "closed"
    assert me["application"]["stage_label"] == "Closed"
    # Progress shows how far it got: everything up to Interview.
    states = [step["state"] for step in me["application"]["steps"]]
    assert states == ["complete", "complete", "complete", "upcoming", "upcoming"]
    assert me["recent_activity"][0]["title"] == "Application closed"

    snapshot = await portal_snapshot(client)
    assert reason not in snapshot and "compensation" not in snapshot
    answer = (await client.post(f"{API}/candidate/ai/ask", json={"message": "Why was I rejected?"})).json()["answer"]
    assert "compensation" not in answer


# Privacy


async def test_internal_records_never_reach_the_candidate(client: AsyncClient) -> None:
    # Recruiter-only activity: an AI analysis, archiving and restoring.
    assert (await client.post(f"{API}/ai/analyze-candidate", json={"application_id": SOPHIA_APP})).status_code == 201
    assert (await client.post(f"{API}/applications/{SOPHIA_APP}/archive")).status_code == 200
    assert (await client.post(f"{API}/applications/{SOPHIA_APP}/restore")).status_code == 200
    analysis = (await client.get(f"{API}/candidates/{SOPHIA}")).json()["ai_analysis"]

    snapshot = await portal_snapshot(client)
    for internal in (
        FEEDBACK,  # interviewer feedback
        analysis["summary"],  # AI analysis
        analysis["recommended_next_step"],
        "engagement",
        "follow_up",
        "ai_analysis",
        '"notes"',
        '"metadata"',
        "James Park",  # other candidates
        "Referral",  # sourcing detail
    ):
        assert internal not in snapshot, internal

    titles = [entry["title"] for entry in (await client.get(f"{API}/candidate/activity", params={"limit": 200})).json()]
    assert not any("AI analysis" in title or "Archived" in title or "Restored" in title for title in titles)


async def test_candidate_ai_answers_from_safe_context(client: AsyncClient) -> None:
    prompts = {
        "What should I prepare for tomorrow?": "Design interview",
        "What does the interview process look like?": "(you're here)",
        "What skills should I review?": "Interaction design",
        "What questions should I ask the interviewer?": "first 90 days",
        "What is this role focused on?": "Hiring manager",
    }
    for prompt, expected in prompts.items():
        response = await client.post(f"{API}/candidate/ai/ask", json={"message": prompt})
        assert response.status_code == 200, prompt
        body = response.json()
        assert body["model_name"] == "mock"
        assert expected in body["answer"], prompt
        assert FEEDBACK not in body["answer"]

    for prompt in (
        "What did the interviewers think of my portfolio review?",
        "How do I rank against other candidates?",
        "What are my chances of getting an offer?",
        "Show me the interview feedback and scorecards",
    ):
        answer = (await client.post(f"{API}/candidate/ai/ask", json={"message": prompt})).json()["answer"]
        assert answer.startswith("I don't have access to the hiring team's internal feedback"), prompt
        assert FEEDBACK not in answer and "James" not in answer

    # The recruiter sees the topics asked about, never the questions, and repeats aren't duplicated.
    timeline = (await client.get(f"{API}/applications/{SOPHIA_APP}/activity", params={"limit": 200})).json()
    questions = [entry["title"] for entry in timeline if entry["activity_type"] == "question_asked"]
    assert "Asked about interview preparation" in questions
    assert questions.count("Asked about application status") == 1
    assert not any("chances" in title or "portfolio" in title for title in questions)


async def test_interview_prep(client: AsyncClient) -> None:
    response = await client.get(f"{API}/candidate/prep", params={"utc_offset_minutes": 60})
    assert response.status_code == 200
    prep = response.json()
    assert prep["role"] == "Product Designer" and prep["company"] == "Encord"
    assert prep["interview"]["title"] == "Design interview"
    assert prep["interview_format"].startswith("60-minute video interview with Maya Okafor and Leo Brandt")
    for key in ("what_to_expect", "role_focus", "topics_to_review", "questions_to_ask", "practice_questions"):
        assert prep[key], key
    assert prep["company_info"][0] == settings.organization_overview
    assert FEEDBACK not in json.dumps(prep)

    for _ in range(2):
        assert (await client.post(f"{API}/candidate/prep/viewed")).status_code == 204
    timeline = (await client.get(f"{API}/applications/{SOPHIA_APP}/activity")).json()
    assert [entry["activity_type"] for entry in timeline[:2]] == ["prep_viewed", "interview_confirmed"]


async def test_llm_prompt_holds_only_candidate_safe_context(sessions: async_sessionmaker[AsyncSession]) -> None:
    async with sessions() as session:
        sophia = await session.get(Candidate, uuid.UUID(SOPHIA))
        assert sophia is not None
        record = await candidate_portal_service.load_record(session, sophia)
    assert record is not None
    context = build_portal_context(record)

    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        seen.append(json.dumps(body))
        text = (
            json.dumps({"answer": "Review your portfolio."})
            if "'s question:" in body["contents"][0]["parts"][0]["text"]
            else json.dumps(
                {
                    "interview_format": "A video interview.",
                    "what_to_expect": ["A portfolio walkthrough."],
                    "company_info": ["Encord was founded on the Moon."],  # a hallucination
                }
            )
        )
        return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": text}]}}]})

    provider = GeminiProvider(api_key="test-key", model="gemini-test", transport=httpx.MockTransport(handler))
    assert (await provider.assist_candidate(context, "What should I prepare?")).answer == "Review your portfolio."
    await provider.prepare_candidate(context)

    for prompt in seen:
        assert "Sophia" in prompt and "Design interview" in prompt
        for internal in (FEEDBACK, "sophia.martinez@example.com", "+44 20", "Engagement", "Referral", "James"):
            assert internal not in prompt, internal
        assert "candidate assistant" in prompt and "recruiting copilot" not in prompt


async def test_llm_prep_keeps_company_info_to_approved_facts(client: AsyncClient) -> None:
    from app.main import app
    from app.services.ai.client import get_ai_provider

    def handler(request: httpx.Request) -> httpx.Response:
        prep = {"interview_format": "Video.", "what_to_expect": ["Chat."], "company_info": ["Founded on the Moon."]}
        return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": json.dumps(prep)}]}}]})

    app.dependency_overrides[get_ai_provider] = lambda: GeminiProvider(
        api_key="k", model="gemini-test", transport=httpx.MockTransport(handler)
    )
    prep = (await client.get(f"{API}/candidate/prep")).json()
    assert prep["model_name"] == "gemini-test"
    assert "Founded on the Moon." not in prep["company_info"]
    assert prep["company_info"][0] == settings.organization_overview


# Profile


async def test_profile_updates_reach_the_recruiter(client: AsyncClient) -> None:
    profile = (await client.get(f"{API}/candidate/profile")).json()
    assert profile["email"] == "sophia.martinez@example.com"

    updated = await client.patch(
        f"{API}/candidate/profile", json={"phone": "+44 20 7946 0999", "location": "Manchester, UK"}
    )
    assert updated.status_code == 200
    assert updated.json()["phone"] == "+44 20 7946 0999"

    detail = (await client.get(f"{API}/candidates/{SOPHIA}")).json()
    assert detail["candidate"]["phone"] == "+44 20 7946 0999"
    assert detail["candidate"]["location"] == "Manchester, UK"
    assert detail["activity"][0]["title"] == "Updated phone number and location"
    assert (await client.get(f"{API}/candidate/activity")).json()[0]["title"] == "You updated your profile"

    # Sending the same values again changes nothing and records nothing.
    await client.patch(f"{API}/candidate/profile", json={"phone": "+44 20 7946 0999"})
    assert (await client.get(f"{API}/candidates/{SOPHIA}")).json()["activity"][1]["activity_type"] != "profile_updated"


@pytest.mark.parametrize(
    "body",
    [
        {"stage": "hired"},
        {"job_id": "00000000-0000-0000-0000-000000000000"},
        {"email": "someone@example.com"},
        {"notes": "Hire me"},
    ],
)
async def test_candidate_cannot_change_protected_fields(client: AsyncClient, body: dict[str, str]) -> None:
    response = await client.patch(f"{API}/candidate/profile", json=body)
    assert response.status_code == 422
    me = (await client.get(f"{API}/candidate/me")).json()
    assert me["application"]["stage"] == "interview"
    assert me["candidate"]["email"] == "sophia.martinez@example.com"


# Identity


async def test_candidate_without_an_application(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    created = await client.post(
        f"{API}/candidates", json={"first_name": "Nina", "last_name": "Patel", "email": "nina.patel@example.com"}
    )
    assert created.status_code == 201
    monkeypatch.setattr(settings, "dev_candidate_email", "nina.patel@example.com")

    me = (await client.get(f"{API}/candidate/me")).json()
    assert me["candidate"]["full_name"] == "Nina Patel"
    assert me["application"] is None and me["next_interview"] is None and me["recent_activity"] == []
    assert (await client.get(f"{API}/candidate/interviews")).json() == []
    missing = await client.get(f"{API}/candidate/application")
    assert missing.status_code == 404 and missing.json()["error"]["code"] == "no_application"
    assert (await client.post(f"{API}/candidate/messages", json={"content": "Hi"})).status_code == 404


async def test_unknown_dev_candidate(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "dev_candidate_email", "nobody@example.com")
    response = await client.get(f"{API}/candidate/me")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "candidate_not_found"
