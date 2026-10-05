"""The recruiter assistant: one action engine for typed and spoken requests, confirmations that run once,
jobs through the same demo jobs as the Jobs page, analytics from the analytics services, and the
boundaries it never crosses (candidates' access, demographics, ranking)."""

import json
import uuid
from typing import Any

import httpx
import pytest
from httpx import AsyncClient
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import settings
from app.core.enums import AssistantActionStatus
from app.main import app
from app.models import Application, AssistantAction, CandidateDemographics, DemoJobPosting, Job, Message
from app.models.base import utcnow
from app.schemas.assistant import AssistantIntent, InterviewDetails
from app.services import message_service
from app.services.ai.client import AIProviderError, get_ai_provider
from app.services.ai.fallback import MockProvider
from app.services.ai.groq import GroqProvider
from app.services.assistant.understand import RANKING_REPLY, SENSITIVE_REPLY
from tests.conftest import API, SOPHIA_AUTH, application_id, bearer, job_id

SOPHIA_APP = application_id("sophia-martinez")
INVITE = "Send Sophia a personalized email asking her to schedule a 30-minute recruiter interview next Tuesday."
CREATE_JOB = (
    "Create an entry-level Recruiting Engineer job in San Francisco. Hybrid. Salary 90 to 120K. "
    "We need AI automation, recruiting, sourcing and Python."
)


async def ask(client: AsyncClient, text: str, **body: Any) -> dict[str, Any]:
    response = await client.post(f"{API}/assistant/requests", json={"text": text, **body})
    assert response.status_code == 200, response.text
    return response.json()


async def messages_to(sessions: async_sessionmaker[AsyncSession], application: str) -> list[Message]:
    async with sessions() as session:
        return list(
            (
                await session.scalars(
                    select(Message).where(Message.application_id == uuid.UUID(application)).order_by(Message.created_at)
                )
            ).all()
        )


def use_provider(provider: Any) -> None:
    app.dependency_overrides[get_ai_provider] = lambda: provider


@pytest.fixture
def jobs_on(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "enable_ashby_demo", True)


@pytest.fixture
def jobs_off(monkeypatch: pytest.MonkeyPatch) -> None:
    """Whatever backend/.env says."""
    monkeypatch.setattr(settings, "enable_ashby_demo", False)


# Who may use it


async def test_only_recruiters_reach_the_assistant(anonymous: AsyncClient, client: AsyncClient, jobs_off: None) -> None:
    candidate = bearer(SOPHIA_AUTH)
    action = uuid.uuid4()
    calls = [
        ("get", "/assistant/status", None),
        ("get", "/assistant/actions", None),
        ("post", "/assistant/requests", {"text": "Show my open jobs"}),
        ("post", f"/assistant/actions/{action}/confirm", {}),
        ("post", f"/assistant/actions/{action}/cancel", None),
    ]
    for method, path, body in calls:
        kwargs: dict[str, Any] = {"headers": candidate}
        if body is not None:
            kwargs["json"] = body
        assert (await getattr(anonymous, method)(f"{API}{path}", **kwargs)).status_code == 403, path
        assert (await getattr(anonymous, method)(f"{API}{path}")).status_code == 401, path
    assert (await client.get(f"{API}/assistant/status")).json() == {
        "voice_transcription": False,
        "jobs": False,
        "model_name": "mock",
    }


# One engine for text and voice


async def test_typed_and_spoken_requests_take_the_same_path(client: AsyncClient) -> None:
    typed = await ask(client, INVITE)
    spoken = await ask(client, INVITE, input_type="voice")
    assert (
        (typed["intent"], typed["status"])
        == (spoken["intent"], spoken["status"])
        == ("send_interview_email", "proposed")
    )
    assert spoken["input_type"] == "voice" and spoken["transcript"] == INVITE
    strip = lambda card: {k: v for k, v in card.items() if k != "action_id"}
    assert strip(typed["cards"][0]) == strip(spoken["cards"][0])


async def test_a_request_is_understood_as_one_structured_action(client: AsyncClient) -> None:
    from app.services.assistant.rules import parse

    intent = parse(INVITE)
    assert intent == AssistantIntent(
        action="send_interview_email",
        mode="execute",
        candidate_name="Sophia",
        instructions=INVITE,
        interview=InterviewDetails(interview_type="Recruiter interview", duration_minutes=30, timeframe="next Tuesday"),
    )
    assert parse("Draft a message telling Daniel his interview moved to Thursday.").action == "draft_message"
    assert parse("How many candidates used the portal this week?").model_dump(exclude_defaults=True) == {
        "action": "analytics",
        "metric": "active_candidates",
        "period": "this_week",
    }
    job = parse(CREATE_JOB).job
    assert job is not None
    assert (job.title, job.location, job.work_arrangement, job.seniority) == (
        "Recruiting Engineer",
        "San Francisco",
        "Hybrid",
        "Entry Level",
    )
    assert (job.salary_min, job.salary_max) == (90_000, 120_000)
    assert job.skills_add == ["AI automation", "Recruiting", "Sourcing", "Python"]
    edit = parse("Make the salary 100 to 130 and add talent research.", job_in_context=True)
    assert edit.action == "update_job" and edit.job is not None
    assert (edit.job.salary_min, edit.job.salary_max, edit.job.skills_add) == (100_000, 130_000, ["Talent research"])


async def test_a_models_reading_is_used_and_a_failed_one_falls_back(client: AsyncClient) -> None:
    class Reader(MockProvider):
        name, model = "reader", "reader-1"

        async def understand_request(self, text: str, context: str) -> AssistantIntent:
            return AssistantIntent(action="list_jobs")

    use_provider(Reader())
    answer = await ask(client, "whatever the words, the model said: jobs")
    assert (answer["intent"], answer["model_name"]) == ("list_jobs", "reader-1")

    class Broken(MockProvider):
        name, model = "broken", "broken-1"

        async def understand_request(self, text: str, context: str) -> AssistantIntent:
            raise AIProviderError("down")

    use_provider(Broken())
    answer = await ask(client, "Show my open jobs")
    assert (answer["intent"], answer["model_name"]) == ("list_jobs", "rules")


async def test_groq_reads_a_request_as_json() -> None:
    def reply(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        assert "send_interview_email" in body["messages"][1]["content"]
        content = {"action": "send_interview_email", "mode": "execute", "candidate_name": "Sophia"}
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(content)}}]})

    provider = GroqProvider(api_key="test", model="test-model", transport=httpx.MockTransport(reply))
    intent = await provider.understand_request(INVITE, "")
    assert (intent.action, intent.candidate_name, intent.mode) == ("send_interview_email", "Sophia", "execute")


# Messages: proposed, confirmed once, failures reported


async def test_an_interview_invitation_is_written_and_sent_only_when_confirmed(
    client: AsyncClient, sessions: async_sessionmaker[AsyncSession]
) -> None:
    before = len(await messages_to(sessions, SOPHIA_APP))
    answer = await ask(client, INVITE, input_type="voice", client_request_id="voice-request-0001")
    [card] = answer["cards"]
    assert card["type"] == "message" and card["status"] == "proposed" and card["mode"] == "execute"
    assert (card["candidate"]["name"], card["candidate"]["job_title"]) == ("Sophia Martinez", "Product Designer")
    assert (card["interview_type"], card["duration_minutes"], card["timeframe"]) == (
        "Recruiter interview",
        30,
        "next Tuesday",
    )
    assert card["body"].startswith("Hi Sophia,\n\nThanks again for your interest in the Product Designer role.")
    assert "30-minute recruiter interview next Tuesday" in card["body"]
    assert card["body"].endswith("Best,\nAlex")
    assert answer["context"] == {"application_id": SOPHIA_APP, "job_id": None, "action_id": answer["id"]}
    assert len(await messages_to(sessions, SOPHIA_APP)) == before  # nothing sent yet

    confirmed = await client.post(f"{API}/assistant/actions/{answer['id']}/confirm", json={})
    assert confirmed.status_code == 200
    assert confirmed.json()["status"] == "completed"
    sent = await messages_to(sessions, SOPHIA_APP)
    assert len(sent) == before + 1 and sent[-1].content == card["body"]

    again = await client.post(f"{API}/assistant/actions/{answer['id']}/confirm", json={})
    assert again.status_code == 409 and again.json()["error"]["code"] == "action_already_handled"
    assert len(await messages_to(sessions, SOPHIA_APP)) == before + 1  # one confirmation, one message

    [recent] = (await client.get(f"{API}/assistant/actions")).json()
    assert recent["summary"] == "Sent interview invitation to Sophia Martinez"
    assert (recent["input_type"], recent["input_text"], recent["intent"], recent["status"]) == (
        "voice",
        INVITE,
        "send_interview_email",
        "completed",
    )
    assert recent["href"] == f"/recruiter/candidates/{SOPHIA_APP}"
    # The candidate sees it in their portal messages.
    portal = (await client.get(f"{API}/candidate/messages")).json()
    assert portal["messages"][-1]["content"] == card["body"]


async def test_the_recruiters_edit_is_what_gets_sent(
    client: AsyncClient, sessions: async_sessionmaker[AsyncSession]
) -> None:
    answer = await ask(client, INVITE)
    edited = "Hi Sophia,\n\nCould you do Tuesday at 2 PM?\n\nBest,\nAlex"
    assert (
        await client.post(f"{API}/assistant/actions/{answer['id']}/confirm", json={"body": edited})
    ).status_code == 200
    assert (await messages_to(sessions, SOPHIA_APP))[-1].content == edited


async def test_a_failed_send_is_reported_as_a_failure(
    client: AsyncClient, sessions: async_sessionmaker[AsyncSession], monkeypatch: pytest.MonkeyPatch
) -> None:
    before = len(await messages_to(sessions, SOPHIA_APP))
    # The application is archived after the proposal: the message service refuses, and so says the result.
    answer = await ask(client, INVITE)
    async with sessions() as session:
        await session.execute(
            update(Application).where(Application.id == uuid.UUID(SOPHIA_APP)).values(archived_at=utcnow())
        )
        await session.commit()
    result = (await client.post(f"{API}/assistant/actions/{answer['id']}/confirm", json={})).json()
    assert result["status"] == "failed"
    assert result["cards"][0]["status"] == "failed" and "Restore Sophia" in result["cards"][0]["error"]
    assert len(await messages_to(sessions, SOPHIA_APP)) == before
    [recent] = (await client.get(f"{API}/assistant/actions")).json()
    assert (recent["status"], recent["summary"]) == ("failed", "Couldn't send message to Sophia Martinez")

    # An unexpected failure is a failure too, never a success.
    async with sessions() as session:
        await session.execute(
            update(Application).where(Application.id == uuid.UUID(SOPHIA_APP)).values(archived_at=None)
        )
        await session.commit()
    answer = await ask(client, INVITE)

    async def broken(*_: Any, **__: Any) -> None:
        raise RuntimeError("provider down")

    monkeypatch.setattr(message_service, "send_message", broken)
    result = (await client.post(f"{API}/assistant/actions/{answer['id']}/confirm", json={})).json()
    assert result["status"] == "failed"
    assert len(await messages_to(sessions, SOPHIA_APP)) == before


async def test_drafting_sends_nothing_and_send_it_asks_for_confirmation(
    client: AsyncClient, sessions: async_sessionmaker[AsyncSession]
) -> None:
    before = len(await messages_to(sessions, SOPHIA_APP))
    draft = await ask(client, "Draft an interview email for Sophia.")
    assert draft["cards"][0]["mode"] == "draft" and "Nothing has been sent" in draft["reply"]
    escalated = await ask(client, "send it", context=draft["context"])
    assert escalated["intent"] == "confirm"
    assert escalated["cards"][0]["mode"] == "execute" and escalated["cards"][0]["action_id"] == draft["id"]
    assert len(await messages_to(sessions, SOPHIA_APP)) == before  # voice alone never sends

    cancelled = await ask(client, "cancel", context=escalated["context"])
    assert "Nothing was sent" in cancelled["reply"]
    assert (await client.post(f"{API}/assistant/actions/{draft['id']}/confirm", json={})).status_code == 409


async def test_a_message_says_what_the_recruiter_asked(client: AsyncClient) -> None:
    answer = await ask(client, "Draft a message telling Daniel his interview moved to Thursday.")
    card = answer["cards"][0]
    assert card["candidate"]["name"] == "Daniel Lee" and card["purpose"] == "Message"
    assert "your interview moved to Thursday" in card["body"]


async def test_an_ambiguous_name_is_asked_about_never_guessed(
    client: AsyncClient, sessions: async_sessionmaker[AsyncSession]
) -> None:
    for first, last, job in (("Alex", "Morgan", "Product Designer"), ("Alex", "Rivera", "ML Engineer")):
        response = await client.post(
            f"{API}/candidates",
            json={
                "first_name": first,
                "last_name": last,
                "email": f"{first}.{last}@example.com".lower(),
                "job_id": job_id(job),
            },
        )
        assert response.status_code == 201
    text = "Send Alex an interview invitation for next week."
    answer = await ask(client, text)
    assert answer["status"] == "needs_clarification"
    [card] = answer["cards"]
    assert card["question"] == "I found 2 candidates named Alex. Which one?"
    assert [(option["label"], option["detail"]) for option in card["options"]] == [
        ("Alex Morgan", "Product Designer · Sourced"),
        ("Alex Rivera", "ML Engineer · Sourced"),
    ]
    async with sessions() as session:
        assert (
            await session.scalar(
                select(func.count())
                .select_from(AssistantAction)
                .where(AssistantAction.status == AssistantActionStatus.PROPOSED)
            )
            == 0
        )

    chosen = card["options"][1]
    picked = await ask(client, chosen["reply"], context={"application_id": chosen["application_id"]})
    assert picked["status"] == "proposed" and picked["cards"][0]["candidate"]["name"] == "Alex Rivera"

    nobody = await ask(client, "Send Zelda an interview invitation.")
    assert nobody["status"] == "answered" and "couldn't find" in nobody["reply"].lower()


async def test_a_name_spelled_as_it_sounds_is_matched_and_said_so(client: AsyncClient) -> None:
    """Speech transcription writes "Sofia" for Sophia; the reply says how it was read, and sending still
    waits for the recruiter."""
    answer = await ask(client, "Send Sofia a personalized email asking her to schedule an interview next Tuesday.")
    assert answer["status"] == "proposed"
    assert answer["cards"][0]["candidate"]["name"] == "Sophia Martinez"
    assert answer["reply"].startswith("I took “Sofia” to mean Sophia Martinez.")


async def test_a_repeated_request_runs_once(client: AsyncClient, sessions: async_sessionmaker[AsyncSession]) -> None:
    first = await ask(client, INVITE, client_request_id="double-click-0001")
    second = await ask(client, INVITE, client_request_id="double-click-0001")
    assert first == second
    async with sessions() as session:
        assert await session.scalar(select(func.count()).select_from(AssistantAction)) == 1


# Jobs: the same demo jobs as the Jobs page


async def test_a_spoken_job_is_a_normal_draft_that_follow_ups_change_and_publishing_lists(
    client: AsyncClient, anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession], jobs_on: None
) -> None:
    created = await ask(client, CREATE_JOB, input_type="voice", client_request_id="create-job-0001")
    assert (created["intent"], created["status"]) == ("create_job", "completed")
    job = created["cards"][0]["job"]
    assert (job["title"], job["location"], job["work_arrangement"], job["seniority"], job["salary"], job["status"]) == (
        "Recruiting Engineer",
        "San Francisco",
        "Hybrid",
        "Entry Level",
        "$90K–$120K",
        "draft",
    )
    assert {"AI automation", "Recruiting", "Sourcing", "Python"} <= set(job["skills"])
    # The same request again (a double click) creates nothing more.
    assert await ask(client, CREATE_JOB, input_type="voice", client_request_id="create-job-0001") == created

    # It is an ordinary job with an ordinary posting, as the editor makes.
    jobs = (await client.get(f"{API}/jobs")).json()
    assert [(item["title"], item["status"]) for item in jobs if item["id"] == job["id"]] == [
        ("Recruiting Engineer", "draft")
    ]
    demo = (await client.get(f"{API}/demo/jobs/{job['id']}")).json()
    assert (demo["salary_min"], demo["salary_max"], demo["status"]) == (90_000, 120_000, "draft")
    assert demo["summary"] and demo["responsibilities"] and demo["requirements"]

    edited = await ask(client, "Make the salary 100 to 130 and add talent research.", context=created["context"])
    assert edited["intent"] == "update_job" and edited["cards"][0]["job"]["id"] == job["id"]
    assert edited["cards"][0]["job"]["salary"] == "$100K–$130K"
    assert "Talent research" in edited["cards"][0]["job"]["skills"]
    assert edited["cards"][0]["changes"] == ["Salary: $100K–$130K", "Added Talent research"]
    hybrid = await ask(client, "Make it remote.", context=edited["context"])
    assert hybrid["cards"][0]["job"]["work_arrangement"] == "Remote"
    shorter = await ask(client, "Make the description shorter.", context=hybrid["context"])
    assert len((await client.get(f"{API}/demo/jobs/{job['id']}")).json()["responsibilities"]) <= 4
    async with sessions() as session:
        assert await session.scalar(select(func.count()).select_from(DemoJobPosting)) == 1  # one draft, edited

    proposed = await ask(client, "Publish the job.", context=shorter["context"])
    assert (proposed["status"], proposed["cards"][0]["stage"]) == ("proposed", "ready_to_publish")
    assert (await anonymous.get(f"{API}/demo/careers/jobs")).json() == []  # not until confirmed
    published = (await client.post(f"{API}/assistant/actions/{proposed['id']}/confirm")).json()
    assert published["status"] == "completed" and published["cards"][0]["stage"] == "published"

    listed = (await anonymous.get(f"{API}/demo/careers/jobs")).json()
    assert [(item["id"], item["title"], item["salary_min"], item["salary_max"]) for item in listed] == [
        (job["id"], "Recruiting Engineer", 100_000, 130_000)
    ]
    assert [item["status"] for item in (await client.get(f"{API}/jobs")).json() if item["id"] == job["id"]] == ["open"]
    summaries = [item["summary"] for item in (await client.get(f"{API}/assistant/actions")).json()]
    assert summaries[0] == "Published Recruiting Engineer"
    assert "Created draft Recruiting Engineer" in summaries


async def test_without_the_demo_jobs_switch_jobs_arent_created(
    client: AsyncClient, sessions: async_sessionmaker[AsyncSession], jobs_off: None
) -> None:
    answer = await ask(client, CREATE_JOB)
    assert "switched off" in answer["reply"]
    async with sessions() as session:
        assert (
            await session.scalar(select(func.count()).select_from(Job).where(Job.title == "Recruiting Engineer")) == 0
        )


# Questions


async def test_analytics_questions_are_answered_from_the_analytics(client: AsyncClient) -> None:
    analytics = (await client.get(f"{API}/analytics/portal", params={"range": "last_7_days"})).json()
    top = analytics["topics"]["items"][0]
    answer = await ask(client, "What were candidates looking for the most this week?")
    assert answer["intent"] == "analytics"
    assert f"**{top['label']}**: {top['share']}%" in answer["reply"]
    assert answer["sources"][0]["label"] == "Candidate Portal Analytics · Last 7 days"
    assert answer["cards"][0]["href"] == "/recruiter/analytics?range=last_7_days"

    active = next(kpi for kpi in analytics["kpis"] if kpi["key"] == "active_candidates")
    used = await ask(client, "How many candidates used the portal this week?")
    assert used["reply"].startswith(f"**{active['display']} candidate")


async def test_demographic_questions_get_aggregates_and_never_a_person(
    client: AsyncClient, sessions: async_sessionmaker[AsyncSession]
) -> None:
    async with sessions() as session:
        ids = (await session.scalars(select(Application.candidate_id).limit(12))).all()
        for index, candidate in enumerate(ids):
            session.add(CandidateDemographics(candidate_id=candidate, race_ethnicity="asian" if index < 6 else "white"))
        await session.commit()
    aggregate = await ask(client, "What share of respondents identified as Asian?")
    assert aggregate["intent"] == "analytics"
    assert "Asian 50%" in aggregate["reply"] and "White 50%" in aggregate["reply"]
    assert "Sophia" not in json.dumps(aggregate)

    for text in (
        "Did Sophia identify as Asian?",
        "Show candidates who are Hispanic",
        "Draft a message to Sophia about her disability",
    ):
        refused = await ask(client, text)
        assert refused["reply"] == SENSITIVE_REPLY and refused["cards"] == [], text
    ranked = await ask(client, "Rank candidates by engagement")
    assert ranked["reply"] == RANKING_REPLY


async def test_candidates_interviews_and_jobs(client: AsyncClient) -> None:
    upcoming = await ask(client, "What interview does Sophia have next?")
    assert upcoming["cards"][0]["interview"]["title"] == "Design interview"
    assert "Design interview" in upcoming["reply"] and "confirmed" in upcoming["reply"]

    about = await ask(client, "Tell me about Sophia's application")
    assert about["intent"] == "candidate_info" and about["reply"] and about["sources"]

    listed = await ask(client, "Show candidates interviewing for Product Designer")
    expected = (
        await client.get(f"{API}/candidates", params={"stage": "interview", "job_id": job_id("Product Designer")})
    ).json()
    card = listed["cards"][0]
    assert card["total"] == expected["total"] > 0
    assert [item["application_id"] for item in card["items"]] == [item["application_id"] for item in expected["items"]]

    jobs = await ask(client, "Show my open jobs")
    open_jobs = (await client.get(f"{API}/jobs", params={"status": "open"})).json()
    assert len(jobs["cards"][0]["items"]) == len(open_jobs) and str(len(open_jobs)) in jobs["reply"]

    unclear = await ask(client, "Hmm, sing me a song")
    assert unclear["intent"] == "help" and "Messages" in unclear["reply"]
