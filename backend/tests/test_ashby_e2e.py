"""The whole journey: an Ashby applicant becomes a portal user, engages, is closed out, applies
again, and a reconciliation sync changes nothing. Runs three times, each from a clean database."""

import json

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.integrations.ashby.sync import AshbySync
from app.models import Application, Candidate, PortalSession, User
from tests.ashby_support import (
    APPLICATION_ID,
    EMAIL,
    FakeAshbyAPI,
    FakeSupabaseAdmin,
    ago,
    application_event,
    deliver,
    schedule_event,
)
from tests.conftest import API, bearer
from tests.test_ashby_sync import client_for

SECOND_APPLICATION = "0e9d8c7b-6a5f-4e4d-8c3b-2a1f0e9d8c7b"
SECOND_JOB = "1f0e9d8c-7b6a-4f5e-8d4c-3b2a1f0e9d8c"


async def count(sessions: async_sessionmaker[AsyncSession], model: type, *where: object) -> int:
    async with sessions() as session:
        return await session.scalar(select(func.count()).select_from(model).where(*where)) or 0


@pytest.mark.parametrize("run", [1, 2, 3])
async def test_ashby_applicant_journey(
    run: int,
    anonymous: AsyncClient,
    client: AsyncClient,
    sessions: async_sessionmaker[AsyncSession],
    ashby: FakeSupabaseAdmin,
) -> None:
    # 1. Applies in Ashby to TEST - ML Engineer.
    submit = application_event(updated_at=ago(hours=6), created_at=ago(hours=6))
    assert (await deliver(anonymous, submit)).json()["status"] == "processed"

    # 2. One candidate, one application, invited to the portal.
    assert await count(sessions, Candidate, Candidate.email == EMAIL) == 1
    assert await count(sessions, Application, Application.external_id == APPLICATION_ID) == 1
    async with sessions() as session:
        candidate = await session.scalar(select(Candidate).where(Candidate.email == EMAIL))
        assert candidate is not None and candidate.portal_status == "invited"
        candidate_id = candidate.id

    # 3. The same webhook three more times: nothing new, no second invitation.
    for _ in range(3):
        assert (await deliver(anonymous, submit)).json()["status"] == "duplicate"
    assert await count(sessions, Candidate, Candidate.email == EMAIL) == 1
    assert await count(sessions, Application, Application.external_id == APPLICATION_ID) == 1
    assert await count(sessions, User, User.email == EMAIL) == 1
    assert len(ashby.invites) == 1

    # 4-5. They accept the invitation (choosing their own password in Supabase) and sign in.
    auth_id = ashby.users[EMAIL]
    first_login = bearer(auth_id, session_id=f"login-1-{run}")
    me = await anonymous.get(f"{API}/candidate/me", headers=first_login)
    assert me.status_code == 200

    # 6. The application is in Active.
    applications = me.json()["applications"]
    assert [(a["job_title"], a["status"], a["stage_label"]) for a in applications] == [
        ("TEST - ML Engineer", "active", "Screening")
    ]
    portal_app = applications[0]["id"]

    # 7-8. Ashby moves them from screening to interview; the portal follows.
    stage_change = application_event("candidateStageChange", stage="Technical Interview", updated_at=ago(hours=5))
    await deliver(anonymous, stage_change)
    me = (await anonymous.get(f"{API}/candidate/me", headers=first_login)).json()
    assert me["application"]["stage_label"] == "Interview"
    assert me["recent_activity"][0]["title"] == "Moved to Interview"

    # 9-10. Ashby schedules the interview; the candidate sees it.
    await deliver(anonymous, schedule_event(updated_at=ago(hours=4)))
    interviews = (await anonymous.get(f"{API}/candidate/interviews", headers=first_login)).json()
    assert [(i["title"], i["can_confirm"]) for i in interviews] == [("Technical Interview", True)]
    interview_id = interviews[0]["id"]

    # 11-12. Two sign-ins and a look around. How a candidate uses the portal isn't recorded.
    for login in (first_login, bearer(auth_id, session_id=f"login-2-{run}")):
        for page in ("me", "interviews", "messages"):
            assert (await anonymous.get(f"{API}/candidate/{page}", headers=login)).status_code == 200
    assert await count(sessions, PortalSession) == 0

    # 13. Confirms the interview; the recruiter sees it.
    confirmed = await anonymous.patch(f"{API}/candidate/interviews/{interview_id}/confirm", headers=first_login)
    assert confirmed.status_code == 200 and confirmed.json()["confirmed_at"]
    async with sessions() as session:
        application = await session.scalar(select(Application).where(Application.external_id == APPLICATION_ID))
        assert application is not None
        app_id = application.id
    recruiter_interviews = (await client.get(f"{API}/applications/{app_id}/interviews")).json()
    assert recruiter_interviews[0]["confirmed_at"] == confirmed.json()["confirmed_at"]

    # 14-16. The recruiter writes and turns on messaging; the candidate replies, then thanks them and follows up.
    await client.post(f"{API}/applications/{app_id}/messages", json={"content": "Looking forward to Thursday!"})
    blocked = await anonymous.post(f"{API}/candidate/messages", json={"content": "Hi!"}, headers=first_login)
    assert blocked.status_code == 403 and blocked.json()["error"]["code"] == "messaging_disabled"
    opened = await client.put(f"{API}/applications/{app_id}/messaging", json={"enabled": True})
    assert opened.status_code == 200 and opened.json()["candidate_messaging_enabled"] is True
    thread = (await anonymous.get(f"{API}/candidate/messages", headers=first_login)).json()
    assert thread["messages"][-1]["content"] == "Looking forward to Thursday!" and thread["unread"] == 1
    assert (await anonymous.post(f"{API}/candidate/messages/read", headers=first_login)).status_code == 204
    for content, kind in (
        ("Me too, see you then.", "message"),
        ("Thank you for the time today.", "thank_you"),
        ("Is there an update on next steps?", "follow_up"),
    ):
        sent = await anonymous.post(
            f"{API}/candidate/messages", json={"content": content, "kind": kind}, headers=first_login
        )
        assert sent.status_code == 201
    recruiter_thread = (await client.get(f"{API}/applications/{app_id}/messages")).json()
    assert [m["kind"] for m in recruiter_thread[-3:]] == ["message", "thank_you", "follow_up"]

    # 17. The recruiter's view: source, stage, portal access and communication health.
    detail = (await client.get(f"{API}/candidates/{candidate_id}")).json()
    assert (
        detail["application"]["origin"] == "ashby"
        and detail["application"]["external_stage_title"] == "Technical Interview"
    )
    assert detail["candidate"]["portal_status"] == "active" and detail["stage"] == "interview"
    health = (await client.get(f"{API}/applications/{app_id}/communication")).json()
    assert health["next_interview"]["confirmed"] is True
    assert health["open_question"]["excerpt"] == "Is there an update on next steps?"
    assert health["open_question"]["count"] == 2  # their reply and the follow-up; a thank-you needs no answer
    assert health["status"] == "due_soon" and "engagement" not in detail

    # 18-20. Ashby closes it out: no longer under consideration, still visible, reason hidden.
    reason = "Internal: not enough distributed training depth"
    rejected = application_event(
        "candidateStageChange", stage="Archived", status="Archived", archive_reason_type="RejectedByOrg",
        archive_reason_text=reason, updated_at=ago(hours=1),
    )  # fmt: skip
    await deliver(anonymous, rejected)
    me = (await anonymous.get(f"{API}/candidate/me", headers=first_login)).json()
    assert [(a["job_title"], a["status"]) for a in me["applications"]] == [
        ("TEST - ML Engineer", "no_longer_considered")
    ]
    history = (await anonymous.get(f"{API}/candidate/applications/{portal_app}", headers=first_login)).json()
    assert history["application"]["stage_label"] == "No longer under consideration"
    assert reason not in json.dumps(history)
    messages = (await anonymous.get(f"{API}/candidate/messages", headers=first_login)).json()["messages"]
    assert len(messages) == 4  # the conversation is still there
    assert reason not in json.dumps(me) and reason not in json.dumps(messages)

    # 21-22. They apply again, to another job, with their email in different casing.
    second = application_event(
        application_id=SECOND_APPLICATION, job_id=SECOND_JOB, job_title="TEST - Data Engineer",
        email="TAYLOR.Applicant@example.COM", updated_at=ago(minutes=30), created_at=ago(minutes=30),
    )  # fmt: skip
    assert (await deliver(anonymous, second)).json()["status"] == "processed"
    assert await count(sessions, Candidate, Candidate.email == EMAIL) == 1
    assert await count(sessions, User, User.email == EMAIL) == 1
    assert await count(sessions, Application, Application.candidate_id == candidate_id) == 2
    assert len(ashby.invites) == 1  # the same account
    me = (await anonymous.get(f"{API}/candidate/me", headers=first_login)).json()
    assert [(a["job_title"], a["status"]) for a in me["applications"]] == [
        ("TEST - Data Engineer", "active"),
        ("TEST - ML Engineer", "no_longer_considered"),
    ]
    assert me["job"]["title"] == "TEST - Data Engineer"  # opens on the active one
    assert me["application"]["stage_label"] == "Screening"

    # 23. A reconciliation sync of the same records changes nothing.
    api = FakeAshbyAPI()
    api.add("application.list", rejected["data"]["application"])
    api.add("application.list", second["data"]["application"])
    api.add("interviewSchedule.list", schedule_event(updated_at=ago(hours=4))["data"]["interviewSchedule"])
    report = await AshbySync(sessions, client_for(api), admin=ashby).run()  # type: ignore[arg-type]
    assert all(item.created == 0 and item.error is None for item in report.resources)
    assert await count(sessions, Candidate, Candidate.email == EMAIL) == 1
    assert await count(sessions, Application, Application.candidate_id == candidate_id) == 2
    assert len(ashby.invites) == 1
