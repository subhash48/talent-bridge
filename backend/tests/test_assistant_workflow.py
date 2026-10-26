"""The recruiter's workflow through the AI Assistant, typed or spoken, from a new job to interviews:

    create a job (a draft) -> change it -> approve it -> its applicants -> criteria and a shortlist with
    evidence -> the recruiter ticks candidates -> one personal draft each -> interview times -> one final
    look -> approve -> each message and interview, once.

Nothing is created, sent or scheduled before the recruiter approves, and only the candidates they picked
are ever touched.
"""

import uuid
from datetime import date, timedelta
from typing import Any

from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.enums import DraftStatus, JobStatus, SenderType
from app.integrations.calendar import NOT_CONFIGURED
from app.main import app
from app.models import Application, CommunicationDraft, Interview, Job, Message
from app.models.base import utcnow
from app.schemas.assistant import AssistantIntent, JobChanges
from app.services.ai.client import get_ai_provider
from app.services.ai.fallback import MockProvider
from tests.conftest import API, FakeEmail, application_id, use_email

SOPHIA = application_id("sophia-martinez")  # her Encord Product Designer application
MAYA = application_id("maya-brooks")
JAMES = application_id("james-whitfield")
NEW_JOB = (
    "Create a Senior Product Designer role in New York, hybrid, requiring Figma, design systems, user research "
    "and B2B SaaS experience."
)


async def ask(client: AsyncClient, text: str, context: dict[str, Any] | None = None, **body: Any) -> dict[str, Any]:
    response = await client.post(
        f"{API}/assistant/requests", json={"text": text, "context": context or {}, "input_type": "voice", **body}
    )
    assert response.status_code == 200, response.text
    return response.json()


async def count(sessions: async_sessionmaker[AsyncSession], model: type, *where: object) -> int:
    async with sessions() as session:
        return await session.scalar(select(func.count()).select_from(model).where(*where)) or 0


def next_tuesday(today: date) -> date:
    return today + timedelta(days=7 - today.weekday()) + timedelta(days=1)


# Test A: a job is a draft until approved


async def test_a_job_is_drafted_changed_and_created_only_once_approved(
    client: AsyncClient, sessions: async_sessionmaker[AsyncSession]
) -> None:
    jobs = await count(sessions, Job)
    drafted = await ask(client, NEW_JOB)
    assert (drafted["intent"], drafted["status"]) == ("create_job", "proposed")
    assert drafted["reply"].startswith("I drafted the **Senior Product Designer** role. Review it before creating")
    [card] = drafted["cards"]
    draft = card["draft"]
    assert card["type"] == "job_draft" and card["stage"] == "draft"
    assert (draft["title"], draft["location"], draft["work_arrangement"], draft["seniority"]) == (
        "Senior Product Designer",
        "New York",
        "Hybrid",
        "Senior",
    )
    assert draft["skills"][:4] == ["Figma", "Design systems", "User research", "B2B SaaS"]
    assert draft["summary"] and draft["description"] and draft["responsibilities"] and draft["requirements"]
    assert draft["employment_type"] == "Full-time" and draft["department"] == "Design"
    # What wasn't said is left for the recruiter, never invented.
    assert (draft["salary_min"], draft["salary_max"]) == (None, None)
    assert "Salary: not given, and never guessed" in card["missing"]
    assert any(note.startswith("Department:") for note in card["missing"])
    assert await count(sessions, Job) == jobs  # no job yet

    changed = await ask(client, "Add Kubernetes and model monitoring.", drafted["context"])
    [card] = changed["cards"]
    assert card["action_id"] == drafted["id"] and card["changes"] == ["Added Kubernetes and Model monitoring"]
    assert {"Kubernetes", "Model monitoring"} <= set(card["draft"]["skills"])

    asked = await ask(client, "Looks good.", changed["context"])
    assert asked["reply"].startswith("Create this job?") and asked["cards"][0]["stage"] == "confirm"
    assert await count(sessions, Job) == jobs  # "looks good" only asks

    created = await ask(client, "Yes.", asked["context"])
    [card] = created["cards"]
    assert card["stage"] == "created" and card["status"] == "completed"
    assert created["reply"].startswith("Created **Senior Product Designer**")
    assert await count(sessions, Job) == jobs + 1
    async with sessions() as session:
        job = await session.get(Job, uuid.UUID(card["job_id"]))
        assert job is not None and job.status == JobStatus.OPEN
        assert (job.title, job.location, job.department) == ("Senior Product Designer", "New York · Hybrid", "Design")
        assert "Requirements: Figma, Design systems, User research, B2B SaaS" in (job.description or "")
        assert "Kubernetes, Model monitoring." in (job.description or "")
    assert created["context"]["job_id"] == card["job_id"]
    # Once only.
    again = await client.post(f"{API}/assistant/actions/{drafted['id']}/confirm", json={})
    assert again.status_code == 409 and await count(sessions, Job) == jobs + 1
    # It's on the careers site, and its (empty) list of applicants is one request away.
    assert (await client.get(f"{API}/careers/jobs/{card['job_id']}")).status_code == 200
    applicants = await ask(client, "Show applicants for that role.", created["context"])
    [listed] = applicants["cards"]
    assert listed["filters"] == [{"key": f"job:{card['job_id']}", "label": "Job: Senior Product Designer · Encord"}]
    assert listed["considered"] == 0


async def test_approve_and_create_takes_the_recruiters_edits(
    client: AsyncClient, sessions: async_sessionmaker[AsyncSession]
) -> None:
    drafted = await ask(
        client,
        "Create a Product Designer role in London. Hybrid, mid-level. Need Figma, design systems, user research and B2B SaaS experience.",
    )
    draft = {
        **drafted["cards"][0]["draft"],
        "title": "Product Designer, Platform",
        "salary_min": 70000,
        "salary_max": 90000,
    }
    draft["salary_currency"] = "GBP"
    confirmed = (await client.post(f"{API}/assistant/actions/{drafted['id']}/confirm", json={"job": draft})).json()
    async with sessions() as session:
        job = await session.get(Job, uuid.UUID(confirmed["cards"][0]["job_id"]))
        assert job is not None and job.title == "Product Designer, Platform"
        assert "Salary: £70K–£90K" in (job.description or "")
    # "Approve" in so many words creates a job draft at once; a cancelled draft creates nothing.
    other = await ask(client, "Create a Staff Data Scientist role")
    approved = await ask(client, "Approve", other["context"])
    assert approved["cards"][0]["stage"] == "created"
    jobs = await count(sessions, Job)
    third = await ask(client, "Create a Recruiting Coordinator role")
    cancelled = await ask(client, "Cancel", third["context"])
    assert cancelled["reply"] == "Cancelled. No job was created." and await count(sessions, Job) == jobs


# Tests B to F: shortlist, select, reach out, schedule, approve


async def test_shortlist_select_draft_schedule_and_send(
    client: AsyncClient, sessions: async_sessionmaker[AsyncSession]
) -> None:
    listed = await ask(client, "Show candidates for Product Designer.")
    [card] = listed["cards"]
    assert card["type"] == "candidate_match"
    assert [item["label"] for item in card["filters"]] == ["Job: Product Designer · Encord"]
    assert card["considered"] == 10 and card["href"].startswith("/recruiter/candidates?job=")

    narrowed = await ask(client, "Show 5 candidates matching Figma and design systems.", listed["context"])
    [card] = narrowed["cards"]
    assert card["criteria"] == ["Figma", "Design systems"] and card["limit"] == 5 and len(card["items"]) == 5
    assert [item["label"] for item in card["filters"]] == ["Job: Product Designer · Encord"]  # still that job
    assert [item["matched"] for item in card["items"]] == [2, 2, 2, 2, 1]
    assert all(item["evidence"] for item in card["items"])
    assert "Nothing about anyone has changed" in narrowed["reply"]
    stages_before = {item["application_id"]: item["stage"] for item in card["items"]}

    # Test C: the recruiter ticks Sophia and two others; only they are selected.
    picked = await ask(client, "Select Sophia, Maya and James.", narrowed["context"])
    assert picked["context"]["selected_application_ids"] == [SOPHIA, MAYA, JAMES]
    assert picked["reply"].startswith("Selected **Sophia Martinez, Maya Brooks and James Whitfield**")
    assert set(picked["cards"][0]["selected"]) == {SOPHIA, MAYA, JAMES}

    # Test D: one personal draft each; nothing sent.
    sent_before = await count(sessions, Message, Message.sender_type == SenderType.RECRUITER)
    drafted = await ask(client, "Draft interview invitations for the selected candidates.", picked["context"])
    assert (drafted["intent"], drafted["status"]) == ("draft_outreach", "proposed")
    [card] = drafted["cards"]
    assert card["type"] == "outreach" and card["purpose"] == "Interview invitation" and card["stage"] == "review"
    assert [item["candidate"]["application_id"] for item in card["items"]] == [SOPHIA, MAYA, JAMES]
    bodies = [item["body"] for item in card["items"]]
    for item, first in zip(card["items"], ("Sophia", "Maya", "James"), strict=True):
        assert item["body"].startswith(f"Hi {first},") and "Product Designer" in item["body"]
    assert len(set(bodies)) == 3  # personal, not one message for all
    assert drafted["reply"].startswith("**3 personalized drafts**") and "Nothing has been sent" in drafted["reply"]
    assert card["delivery_note"] == "Portal delivered — Email not configured"
    assert [item["replies_open"] for item in card["items"]] == [True, False, False]
    assert await count(sessions, Message, Message.sender_type == SenderType.RECRUITER) == sent_before
    assert await count(sessions, CommunicationDraft, CommunicationDraft.status == DraftStatus.DRAFTED) >= 3

    # Test E: times proposed, drafts rewritten to name them; nothing scheduled, no calendar claimed.
    interviews_before = await count(sessions, Interview)
    scheduled = await ask(client, "Make these 30-minute interviews next Tuesday afternoon.", drafted["context"])
    [card] = scheduled["cards"]
    assert card["action_id"] == drafted["id"]
    plan = card["schedule"]
    tuesday = next_tuesday(utcnow().date())
    assert (plan["duration_minutes"], plan["day"], plan["window_start"]) == (30, tuesday.isoformat(), "13:00")
    assert plan["calendar_configured"] is False and plan["calendar_note"] == NOT_CONFIGURED
    assert plan["meeting_url"] is None  # no video link invented
    starts = [item["slot"]["starts_at"] for item in card["items"]]
    assert [start[11:16] for start in starts] == ["13:00", "13:30", "14:00"]
    assert f"{tuesday:%A}, {tuesday:%B} {tuesday.day}, 1:00 PM–1:30 PM (UTC)" in card["items"][0]["body"]
    assert await count(sessions, Interview) == interviews_before

    # Test F: "send them" is one final look at everything; "yes" to that runs it, once.
    final = await ask(client, "Send them.", scheduled["context"])
    assert final["cards"][0]["stage"] == "final"
    assert final["reply"].startswith(
        "Ready to send 3 personalized interview invitations to Sophia Martinez, Maya Brooks and James Whitfield."
    )
    assert NOT_CONFIGURED in final["reply"]
    assert await count(sessions, Message, Message.sender_type == SenderType.RECRUITER) == sent_before

    done = await ask(client, "Yes", final["context"])
    [card] = done["cards"]
    assert card["stage"] == "done" and card["status"] == "completed"
    assert done["reply"].startswith(
        "Sent 3 personalized interview invitations to Sophia Martinez, Maya Brooks and James"
    )
    assert "Created 3 interviews in TalentBridge; no calendar invitations were sent" in done["reply"]
    for item in card["items"]:
        assert item["result"]["message_sent"] and item["result"]["interview_created"]
        assert (item["result"]["email"], item["result"]["calendar"]) == ("not_configured", "not_configured")
    async with sessions() as session:
        for application, body, start in zip((SOPHIA, MAYA, JAMES), card["items"], starts, strict=True):
            thread = (
                await session.scalars(
                    select(Message).where(Message.application_id == uuid.UUID(application)).order_by(Message.created_at)
                )
            ).all()
            assert thread[-1].content == body["body"]  # in that application's own thread
            interview = await session.scalar(
                select(Interview).where(
                    Interview.application_id == uuid.UUID(application), Interview.duration_minutes == 30
                )
            )
            assert interview is not None and interview.scheduled_at.isoformat()[:16] == start[:16]
            assert interview.meeting_url is None
            opened = await session.get(Application, uuid.UUID(application))
            assert opened is not None and opened.candidate_messaging_enabled  # so they can reply
    assert await count(sessions, Message, Message.sender_type == SenderType.RECRUITER) == sent_before + 3
    assert await count(sessions, Interview) == interviews_before + 3
    # Nobody else was touched, and nobody's stage moved.
    after = await ask(client, "Show 5 candidates matching Figma and design systems.", listed["context"])
    assert {item["application_id"]: item["stage"] for item in after["cards"][0]["items"]} == stages_before
    again = await client.post(f"{API}/assistant/actions/{drafted['id']}/confirm", json={})
    assert again.status_code == 409
    assert await count(sessions, Message, Message.sender_type == SenderType.RECRUITER) == sent_before + 3

    # Test G, the portal side: Sophia sees the message and the interview on her Encord application.
    thread = (await client.get(f"{API}/candidate/messages", params={"application_id": SOPHIA})).json()
    assert thread["messages"][-1]["content"] == card["items"][0]["body"] and thread["can_message"] is True
    interviews = (await client.get(f"{API}/candidate/interviews", params={"application_id": SOPHIA})).json()
    assert any(item["title"] == "Interview" and item["duration_minutes"] == 30 for item in interviews)
    # Test H: none of it shows on her other applications.
    other = (
        await client.get(
            f"{API}/candidate/messages", params={"application_id": application_id("sophia-martinez@openai")}
        )
    ).json()
    assert all(message["content"] != card["items"][0]["body"] for message in other["messages"])


async def test_the_candidates_page_drafts_the_same_proposal_and_only_for_who_is_ticked(
    client: AsyncClient, sessions: async_sessionmaker[AsyncSession]
) -> None:
    response = await client.post(
        f"{API}/assistant/outreach",
        json={
            "application_ids": [MAYA, JAMES],
            "purpose": "message",
            "instructions": "Tell them we're reviewing portfolios this week.",
        },
    )
    assert response.status_code == 200
    proposal = response.json()
    [card] = proposal["cards"]
    assert proposal["status"] == "proposed" and card["purpose"] == "Message" and len(card["items"]) == 2
    assert all("we're reviewing portfolios this week" in item["body"] for item in card["items"])  # as asked
    sent_before = await count(sessions, Message, Message.sender_type == SenderType.RECRUITER)
    # Approve with Maya left out and James's message edited; replies stay off.
    edited = "Hi James,\n\nWe're reviewing portfolios this week and will be in touch by Friday.\n\nBest,\nAlex"
    done = (
        await client.post(
            f"{API}/assistant/actions/{proposal['id']}/confirm",
            json={
                "items": [{"application_id": MAYA, "include": False}, {"application_id": JAMES, "body": edited}],
                "enable_replies": False,
            },
        )
    ).json()
    assert done["status"] == "completed"
    assert done["reply"].startswith("Sent 1 personalized message to James Whitfield")
    assert await count(sessions, Message, Message.sender_type == SenderType.RECRUITER) == sent_before + 1
    async with sessions() as session:
        james = (
            await session.scalars(
                select(Message).where(Message.application_id == uuid.UUID(JAMES)).order_by(Message.created_at)
            )
        ).all()
        assert james[-1].content == edited
        maya = await session.get(Application, uuid.UUID(MAYA))
        assert maya is not None and not maya.candidate_messaging_enabled
        drafts = (
            await session.scalars(
                select(CommunicationDraft.status).where(CommunicationDraft.application_id == uuid.UUID(MAYA))
            )
        ).all()
        assert DraftStatus.DISCARDED in drafts and DraftStatus.SENT not in drafts
    # Leaving everyone out sends nothing.
    second = (await client.post(f"{API}/assistant/outreach", json={"application_ids": [MAYA]})).json()
    nothing = await client.post(
        f"{API}/assistant/actions/{second['id']}/confirm", json={"items": [{"application_id": MAYA, "include": False}]}
    )
    assert nothing.json()["status"] == "failed" and "Tick at least one candidate" in nothing.json()["reply"]


async def test_outreach_needs_candidates_and_approve_still_shows_the_final_look(client: AsyncClient) -> None:
    nobody = await ask(client, "Draft interview invitations for the selected candidates.")
    assert nobody["reply"].startswith("Tick the candidates first")
    drafted = await ask(client, "Draft interview invitations.", {"selected_application_ids": [MAYA]})
    assert drafted["intent"] == "draft_outreach" and len(drafted["cards"][0]["items"]) == 1
    looked = await ask(client, "Approve", drafted["context"])
    assert looked["cards"][0]["stage"] == "final" and looked["cards"][0]["status"] == "proposed"
    cancelled = await ask(client, "Cancel", looked["context"])
    assert cancelled["reply"] == "Cancelled. Nothing was sent or scheduled."


async def test_top_n_is_a_search_on_the_jobs_requirements_and_ranking_is_refused(client: AsyncClient) -> None:
    top = await ask(client, "Show me the top 10 candidates for the ML Engineer role.")
    assert top["reply"].startswith("I don't rank people.")
    [card] = top["cards"]
    assert card["criteria_source"] == "job_requirements" and card["limit"] == 10
    assert card["criteria"] == ["PyTorch", "Computer vision", "Distributed training", "MLOps", "Active learning"]
    for refused in (
        "Who should we reject for ML Engineer?",
        "Score the applicants for Product Designer",
        "Which candidates are the best culture fit?",
    ):
        answer = await ask(client, refused)
        assert answer["cards"] == [] and "I don't rank, score or judge candidates" in answer["reply"], refused
    interviewed = await ask(client, "Show candidates who interviewed but haven't received an update.")
    assert interviewed["cards"][0]["filters"] == [{"key": "interview", "label": "Interviewed, no update since"}]


async def test_skills_a_hosted_model_passes_are_tidied_like_the_rules_do(client: AsyncClient) -> None:
    class Reader(MockProvider):
        name, model = "reader", "reader-1"

        async def understand_request(self, text: str, context: str) -> AssistantIntent:
            changes = JobChanges(title="Senior Product Designer", skills_add=["figma", "B2B SaaS experience"])
            return AssistantIntent(action="create_job", job=changes)

    app.dependency_overrides[get_ai_provider] = Reader
    drafted = await ask(client, "Create a Senior Product Designer role requiring Figma and B2B SaaS experience")
    assert drafted["cards"][0]["draft"]["skills"][:2] == ["Figma", "B2B SaaS"]


# What approving does when something goes wrong for one candidate


async def test_one_candidates_failure_never_stops_or_hides_the_others(
    client: AsyncClient, sessions: async_sessionmaker[AsyncSession]
) -> None:
    proposal = (
        await client.post(
            f"{API}/assistant/outreach", json={"application_ids": [SOPHIA, MAYA, JAMES], "purpose": "message"}
        )
    ).json()
    async with sessions() as session:  # Maya leaves the pipeline before the recruiter approves
        maya = await session.get(Application, uuid.UUID(MAYA))
        assert maya is not None
        maya.archived_at = utcnow()
        await session.commit()
    done = (await client.post(f"{API}/assistant/actions/{proposal['id']}/confirm", json={})).json()
    results = {item["candidate"]["name"]: item["result"] for item in done["cards"][0]["items"]}
    assert results["Sophia Martinez"]["message_sent"] and results["James Whitfield"]["message_sent"]
    assert not results["Maya Brooks"]["message_sent"] and "Restore Maya" in results["Maya Brooks"]["error"]
    assert not results["Maya Brooks"]["messaging_enabled"]  # nothing sent, so replies stay as they were
    assert done["status"] == "failed" and "Couldn't send to Maya Brooks" in done["reply"]
    assert done["reply"].startswith("Sent 2 personalized messages to Sophia Martinez and James Whitfield")


async def test_a_replaced_draft_means_nothing_is_done_for_that_candidate(
    client: AsyncClient, sessions: async_sessionmaker[AsyncSession]
) -> None:
    schedule = {
        "duration_minutes": 10,
        "timeframe": (utcnow().date() + timedelta(days=3)).isoformat(),
        "window_start": "13:00",
        "window_end": "15:00",
    }
    first = (
        await client.post(f"{API}/assistant/outreach", json={"application_ids": [MAYA], "schedule": schedule})
    ).json()
    assert first["cards"][0]["schedule"]["duration_minutes"] == 15  # at least 15 minutes, as interviews are
    await client.post(
        f"{API}/assistant/outreach", json={"application_ids": [MAYA], "purpose": "message"}
    )  # replaces Maya's draft
    interviews = await count(sessions, Interview, Interview.application_id == uuid.UUID(MAYA))
    done = (await client.post(f"{API}/assistant/actions/{first['id']}/confirm", json={})).json()
    [item] = done["cards"][0]["items"]
    assert item["result"]["error"].startswith("Their draft was replaced or sent since this was proposed")
    assert not (item["result"]["interview_created"] or item["result"]["messaging_enabled"])
    assert await count(sessions, Interview, Interview.application_id == uuid.UUID(MAYA)) == interviews
    async with sessions() as session:
        maya = await session.get(Application, uuid.UUID(MAYA))
        assert maya is not None and not maya.candidate_messaging_enabled


async def test_the_reply_says_how_each_email_went(client: AsyncClient) -> None:
    use_email(FakeEmail(fail="Mailbox unavailable"))
    proposal = (
        await client.post(f"{API}/assistant/outreach", json={"application_ids": [MAYA], "purpose": "message"})
    ).json()
    done = (await client.post(f"{API}/assistant/actions/{proposal['id']}/confirm", json={})).json()
    assert "in their candidate portal" in done["reply"] and "by email" not in done["reply"]
    assert "The email failed for Maya Brooks; the message is in their portal." in done["reply"]
