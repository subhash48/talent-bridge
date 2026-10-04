"""The development-only Ashby simulator (app/integrations/ashby/demo.py): its events go through the real
webhook processor, importer and provisioning, nothing is created twice, the application shows up in
both portals, and reset removes only what the simulator made."""

import json
import uuid
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import settings
from app.core.enums import ApplicationStage
from app.db.seed import seed_id
from app.integrations.ashby import demo
from app.models import (
    AIAnalysis,
    Application,
    AshbyWebhookEvent,
    Candidate,
    CandidateActivity,
    CandidateEngagementEvent,
    CandidateStageHistory,
    Interview,
    Job,
    Message,
    PortalSession,
    User,
)
from app.services.ai.fallback import MockProvider
from tests.ashby_support import FakeSupabaseAdmin
from tests.conftest import ALEX_EMAIL, API, SOPHIA_EMAIL, bearer

EMAIL = "testcandidate1@example.com"
JOB = "TEST - ML Engineer"
ARCHIVE_REASON = "Internal: not enough distributed training depth"  # in the fixture's payload, never shown

TABLES = (
    AIAnalysis,
    Application,
    AshbyWebhookEvent,
    Candidate,
    CandidateActivity,
    CandidateEngagementEvent,
    CandidateStageHistory,
    Interview,
    Job,
    Message,
    PortalSession,
    User,
)


@pytest.fixture(autouse=True)
def simulator(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "portal_invites_enabled", True)
    monkeypatch.setattr(settings, "ashby_auto_analyze", True)
    monkeypatch.setattr(settings, "ashby_stage_title_map", {})
    monkeypatch.setattr(settings, "ashby_webhook_secret", None)  # the simulator never needs the real one


async def counts(sessions: async_sessionmaker[AsyncSession]) -> dict[str, int]:
    async with sessions() as session:
        return {
            model.__tablename__: await session.scalar(select(func.count()).select_from(model)) or 0 for model in TABLES
        }


async def rows(sessions: async_sessionmaker[AsyncSession]) -> dict[str, list[Any]]:
    """Every candidate, application, job and user, so a change to any of them shows."""
    async with sessions() as session:
        return {
            "candidates": (
                await session.execute(
                    select(
                        Candidate.id, Candidate.email, Candidate.external_id, Candidate.portal_status, Candidate.user_id
                    ).order_by(Candidate.id)
                )
            ).all(),
            "applications": (
                await session.execute(
                    select(Application.id, Application.stage, Application.updated_at, Application.archived_at).order_by(
                        Application.id
                    )
                )
            ).all(),
            "jobs": (await session.execute(select(Job.id, Job.title, Job.status).order_by(Job.id))).all(),
            "users": (await session.execute(select(User.id, User.email, User.auth_user_id).order_by(User.id))).all(),
        }


async def count(sessions: async_sessionmaker[AsyncSession], model: type, *where: object) -> int:
    async with sessions() as session:
        return await session.scalar(select(func.count()).select_from(model).where(*where)) or 0


async def apply(
    sessions: async_sessionmaker[AsyncSession], admin: FakeSupabaseAdmin | None = None, **kwargs: Any
) -> demo.Outcome:
    values = {"email": EMAIL, "first_name": "Maya", "last_name": "Patel", "job_title": JOB, **kwargs}
    return await demo.apply(sessions, admin=admin, provider=MockProvider(), **values)  # type: ignore[arg-type]


async def test_three_cycles_from_a_clean_state(
    anonymous: AsyncClient, client: AsyncClient, sessions: async_sessionmaker[AsyncSession]
) -> None:
    baseline, before = await counts(sessions), await rows(sessions)

    for _ in range(3):
        # Supabase Auth, where the invited account is created. A new one each cycle: reset never
        # touches Supabase, so this stands for the previous cycle's account having been deleted.
        admin = FakeSupabaseAdmin()

        # 1. Maya applies in Ashby. Delivering it again (Ashby retrying) changes nothing.
        first = await apply(sessions, admin)
        assert first.lines[:2] == ["jobCreate: processed", "applicationSubmit: processed"]
        for _ in range(2):
            again = await apply(sessions, admin)
            assert all("duplicate" in line for line in again.lines[:2])
        assert await count(sessions, Candidate, Candidate.email == EMAIL) == 1
        assert await count(sessions, Application, Application.external_id.startswith(demo.DEMO_PREFIX)) == 1
        assert await count(sessions, Job, Job.title == JOB) == 1
        assert await count(sessions, User, User.email == EMAIL) == 1
        assert len(admin.invites) == 1 and admin.invites[0]["email"] == EMAIL
        assert await count(sessions, AIAnalysis) == baseline["ai_analysis"] + 1  # the analysis ran once

        # 2. The recruiter portal lists the application, from Ashby, with the invitation sent.
        page = (await client.get(f"{API}/candidates", params={"search": EMAIL})).json()
        assert [(item["job"]["title"], item["origin"], item["stage"]) for item in page["items"]] == [
            (JOB, "ashby", "screening")
        ]
        candidate_id = page["items"][0]["candidate"]["id"]
        detail = (await client.get(f"{API}/candidates/{candidate_id}")).json()
        assert detail["application"]["origin"] == "ashby"
        assert detail["application"]["external_stage_title"] == "Application Review"
        assert detail["candidate"]["portal_status"] == "invited"

        # 3. She accepts the invitation and signs in: the same application is in her portal.
        token = bearer(admin.users[EMAIL])
        me = await anonymous.get(f"{API}/candidate/me", headers=token)
        assert me.status_code == 200
        assert [(a["job_title"], a["status"], a["stage_label"]) for a in me.json()["applications"]] == [
            (JOB, "active", "Screening")
        ]
        assert [entry["title"] for entry in me.json()["recent_activity"]] == ["Application received"]

        # 4. Ashby moves her to interview, through the same stage mapping as a real event.
        await demo.stage(sessions, email=EMAIL, stage="interview")
        me = (await anonymous.get(f"{API}/candidate/me", headers=token)).json()
        assert me["application"]["stage_label"] == "Interview"
        assert me["recent_activity"][0]["title"] == "Moved to Interview"

        # 5. Ashby schedules the interview. Doing it again the same day neither adds nor moves it.
        for _ in range(2):
            await demo.interview(sessions, email=EMAIL)
        interviews = (await anonymous.get(f"{API}/candidate/interviews", headers=token)).json()
        assert [(i["title"], i["can_confirm"]) for i in interviews] == [("Technical Interview", True)]
        activity = [
            entry["title"] for entry in (await anonymous.get(f"{API}/candidate/activity", headers=token)).json()
        ]
        assert activity.count("Technical Interview scheduled") == 1
        assert not any("rescheduled" in title for title in activity)

        # 6. Ashby rejects her: no longer under consideration, still visible, the reason never shown.
        await demo.stage(sessions, email=EMAIL, stage="rejected")
        me = (await anonymous.get(f"{API}/candidate/me", headers=token)).json()
        assert [(a["job_title"], a["status"]) for a in me["applications"]] == [(JOB, "no_longer_considered")]
        assert ARCHIVE_REASON not in json.dumps(me)
        detail = (await client.get(f"{API}/candidates/{candidate_id}")).json()
        assert detail["stage"] == "rejected"
        assert ARCHIVE_REASON not in json.dumps(detail)

        # Still exactly one of everything.
        assert await count(sessions, Candidate, Candidate.email == EMAIL) == 1
        assert await count(sessions, Application, Application.external_id.startswith(demo.DEMO_PREFIX)) == 1
        assert await count(sessions, Interview, Interview.external_id.startswith(demo.DEMO_PREFIX)) == 1
        assert len(admin.invites) == 1

        # 7. Reset: back to exactly what was there before, every other row untouched.
        await demo.reset(sessions)
        assert await counts(sessions) == baseline
        assert await rows(sessions) == before
        assert (await anonymous.get(f"{API}/candidate/me", headers=token)).status_code != 200

    # Both portals still work for the people who were there all along.
    assert (await client.get(f"{API}/candidates")).json()["total"] > 0
    sophia = await client.get(f"{API}/candidate/me")
    assert sophia.status_code == 200 and sophia.json()["candidate"]["email"] == SOPHIA_EMAIL


async def test_no_invitation_email_without_send_invite(sessions: async_sessionmaker[AsyncSession]) -> None:
    await apply(sessions, admin=None)
    async with sessions() as session:
        candidate = await session.scalar(select(Candidate).where(Candidate.email == EMAIL))
        assert candidate is not None
        assert candidate.portal_status == "pending_invitation"
        assert candidate.portal_invite_error == demo.NO_EMAIL_NOTE
        assert candidate.user_id is None and candidate.portal_invited_at is None


def test_send_invite_only_to_addresses_that_receive_mail() -> None:
    for email in ("a@example.com", "a@mail.example.org", "a@demo.test", "a@x.invalid", "a@box.localhost"):
        assert not demo.can_receive_mail(email)
        with pytest.raises(demo.DemoError, match="bounce"):
            demo._invite_admin(email, "postgresql")
    assert demo.can_receive_mail("someone@gmail.com")
    with pytest.raises(demo.DemoError, match="Supabase database"):
        demo._invite_admin("someone@gmail.com", "sqlite")


async def test_refuses_people_outside_the_simulator(sessions: async_sessionmaker[AsyncSession]) -> None:
    before = await rows(sessions)
    for email in (SOPHIA_EMAIL, ALEX_EMAIL):  # a seeded candidate, and a recruiter's sign-in
        with pytest.raises(demo.DemoError, match="isn't simulator data"):
            await apply(sessions, email=email)
    assert await rows(sessions) == before
    assert await count(sessions, AshbyWebhookEvent) == 0


async def test_reset_keeps_what_the_simulator_did_not_make(sessions: async_sessionmaker[AsyncSession]) -> None:
    await apply(sessions)
    async with sessions() as session:
        candidate = await session.scalar(select(Candidate).where(Candidate.email == EMAIL))
        assert candidate is not None
        # A recruiter adds the demo candidate to a real job, in Talent Bridge.
        local = Application(
            candidate_id=candidate.id, job_id=seed_id("job", "ML Engineer"), stage=ApplicationStage.SCREENING
        )
        session.add(local)
        await session.commit()
        candidate_id, local_id = candidate.id, local.id

    outcome = await demo.reset(sessions)
    assert f"Kept {EMAIL} and their applications from outside the simulator." in outcome.lines
    async with sessions() as session:
        assert await session.get(Candidate, candidate_id) is not None
        assert await session.get(Application, local_id) is not None
    assert await count(sessions, Application, Application.external_id.startswith(demo.DEMO_PREFIX)) == 0
    assert await count(sessions, Job, Job.external_id.startswith(demo.DEMO_PREFIX)) == 0
    assert await count(sessions, AshbyWebhookEvent) == 0


async def test_stage_and_interview_need_one_simulator_application(sessions: async_sessionmaker[AsyncSession]) -> None:
    with pytest.raises(demo.DemoError, match="Run apply first"):
        await demo.stage(sessions, email=EMAIL, stage="interview")
    await apply(sessions)
    await apply(sessions, job_title="TEST - Data Engineer")
    with pytest.raises(demo.DemoError, match="Choose one with --job"):
        await demo.interview(sessions, email=EMAIL)
    await demo.stage(sessions, email=EMAIL, stage="interview", job_title="test - data engineer")
    async with sessions() as session:
        stages = dict(
            (
                await session.execute(
                    select(Job.title, Application.stage)
                    .join(Job)
                    .where(Application.external_id.startswith(demo.DEMO_PREFIX))
                )
            ).all()
        )
    assert stages == {JOB: "screening", "TEST - Data Engineer": "interview"}
    assert await count(sessions, Candidate, Candidate.email == EMAIL) == 1  # one person, two applications


async def test_refuses_to_run_in_production(
    sessions: async_sessionmaker[AsyncSession], monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(settings, "environment", "production")
    before = await counts(sessions)
    commands = (
        lambda: apply(sessions),
        lambda: demo.stage(sessions, email=EMAIL, stage="rejected"),
        lambda: demo.interview(sessions, email=EMAIL),
        lambda: demo.status(sessions),
        lambda: demo.reset(sessions),
    )
    for command in commands:
        with pytest.raises(demo.DemoError, match="production"):
            await command()
    assert await counts(sessions) == before

    with pytest.raises(SystemExit) as exited:
        demo.main(["reset"])
    assert exited.value.code == 2
    assert "development only" in capsys.readouterr().err


def test_cli_runs_against_the_configured_database(capsys: pytest.CaptureFixture[str]) -> None:
    """The tests' DATABASE_URL is a private in-memory SQLite database, so this touches nothing else."""
    email = f"cli-{uuid.uuid4().hex[:8]}@example.com"
    with pytest.raises(SystemExit) as exited:
        demo.main(["apply", "--email", email, "--first-name", "Cli", "--last-name", "Run"])
    assert exited.value.code == 0
    output = capsys.readouterr().out
    assert "applicationSubmit: processed" in output and "Candidate portal shows: active - Screening" in output
    with pytest.raises(SystemExit) as exited:
        demo.main(["stage", "--email", email, "--stage", "Hired"])
    assert exited.value.code == 1  # a new in-memory database each run: nothing to move
    assert "Run apply first" in capsys.readouterr().err
