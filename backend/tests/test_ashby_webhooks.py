"""The Ashby webhook receiver: signatures, idempotency, ordering and each supported action."""

import json
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import settings
from app.integrations.ashby import importer
from app.main import app
from app.models import (
    AIAnalysis,
    Application,
    AshbyWebhookEvent,
    Candidate,
    CandidateActivity,
    CandidateStageHistory,
    Interview,
    Job,
)
from app.services.ai.client import get_ai_provider
from app.services.ai.fallback import MockProvider
from app.services.ai.groq import GroqProvider
from tests.ashby_support import (
    APPLICATION_ID,
    CANDIDATE_ID,
    EMAIL,
    JOB_ID,
    FakeSupabaseAdmin,
    ago,
    application_event,
    deliver,
    fixture,
    iso,
    schedule_event,
    sign,
)
from tests.conftest import API

pytestmark = pytest.mark.usefixtures("ashby")


async def count(sessions: async_sessionmaker[AsyncSession], model: Any, *where: Any) -> int:
    async with sessions() as session:
        return await session.scalar(select(func.count()).select_from(model).where(*where)) or 0


async def application_row(sessions: async_sessionmaker[AsyncSession], external_id: str = APPLICATION_ID) -> Application:
    async with sessions() as session:
        row = await session.scalar(select(Application).where(Application.external_id == external_id))
        assert row is not None
        return row


async def timeline(sessions: async_sessionmaker[AsyncSession], application_id: uuid.UUID) -> list[str]:
    async with sessions() as session:
        rows = await session.scalars(
            select(CandidateActivity.title)
            .where(CandidateActivity.application_id == application_id)
            .order_by(CandidateActivity.created_at)
        )
        return list(rows)


# Security


async def test_valid_signature_is_accepted(anonymous: AsyncClient) -> None:
    response = await deliver(anonymous, application_event())
    assert response.status_code == 200
    assert response.json() == {"status": "processed", "action": "applicationSubmit", "detail": None}


@pytest.mark.parametrize(
    "signature",
    [
        None,  # missing
        "",  # empty
        "sha256=" + "0" * 64,  # forged
        "sha1=" + "0" * 40,  # another algorithm
        "not-a-signature",
    ],
)
async def test_bad_signatures_are_401_and_change_nothing(
    anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession], signature: str | None
) -> None:
    before = await count(sessions, Candidate)
    response = await deliver(anonymous, application_event(), signature=signature)
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "invalid_signature"
    assert await count(sessions, Candidate) == before
    assert await count(sessions, AshbyWebhookEvent) == 0


async def test_signature_must_cover_the_exact_body(anonymous: AsyncClient) -> None:
    body = json.dumps(application_event()).encode()
    tampered = body.replace(b"TEST - ML Engineer", b"TEST - CEO")
    response = await deliver(anonymous, tampered, signature=sign(body))
    assert response.status_code == 401


async def test_signed_with_another_secret_is_401(anonymous: AsyncClient) -> None:
    body = json.dumps(application_event()).encode()
    assert (await deliver(anonymous, body, signature=sign(body, "someone-elses-secret"))).status_code == 401


async def test_unconfigured_secret_is_503(anonymous: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "ashby_webhook_secret", None)
    response = await deliver(anonymous, application_event())
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "ashby_not_configured"


async def test_ping_is_acknowledged(anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession]) -> None:
    response = await deliver(anonymous, fixture("ping"))
    assert response.status_code == 200 and response.json()["status"] == "ok"
    assert await count(sessions, AshbyWebhookEvent) == 0


async def test_invalid_json_is_400(anonymous: AsyncClient) -> None:
    assert (await deliver(anonymous, b"{not json")).status_code == 400


# applicationSubmit


async def test_application_submit_imports_everything(
    anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession], ashby: FakeSupabaseAdmin
) -> None:
    payload = fixture("applicationSubmit")  # email as typed: "Taylor.Applicant@Example.com "
    payload["data"]["application"]["createdAt"] = iso(ago(minutes=5))
    payload["data"]["application"]["updatedAt"] = iso(ago(minutes=5))
    assert (await deliver(anonymous, payload)).status_code == 200

    async with sessions() as session:
        job = await session.scalar(select(Job).where(Job.external_id == JOB_ID))
        candidate = await session.scalar(select(Candidate).where(Candidate.external_id == CANDIDATE_ID))
        application = await session.scalar(select(Application).where(Application.external_id == APPLICATION_ID))
        assert job is not None and candidate is not None and application is not None
        assert job.title == "TEST - ML Engineer" and job.status == "open"
        assert candidate.email == EMAIL  # lowercased and trimmed
        assert (candidate.first_name, candidate.last_name) == ("Taylor", "Applicant")
        assert candidate.phone == "+1 415 555 0100"
        assert application.candidate_id == candidate.id and application.job_id == job.id
        assert application.stage == "screening"  # PreInterviewScreen
        assert application.source == "Applied"
        assert (application.external_status, application.external_stage_title, application.external_stage_type) == (
            "Active",
            "Application Review",
            "PreInterviewScreen",
        )
        assert application.external_updated_at is not None
        history = (await session.scalars(select(CandidateStageHistory.new_stage).where(CandidateStageHistory.application_id == application.id))).all()
        assert history == ["screening"]
        # Invited at the email they applied with; the invitation and analysis ran after the import.
        assert candidate.portal_status == "invited" and candidate.user_id is not None
        assert await session.scalar(select(func.count()).select_from(AIAnalysis).where(AIAnalysis.application_id == application.id)) == 1
    assert [invite["email"] for invite in ashby.invites] == [EMAIL]
    assert ashby.invites[0]["redirect_to"].endswith("/auth/confirm?next=/welcome")
    assert "password" not in json.dumps(ashby.invites)
    titles = await timeline(sessions, application.id)
    assert titles[0] == "Application received"
    assert "Candidate portal invitation sent" in titles and "AI analysis generated" in titles

    # Nothing personal from the payload is kept on the event record.
    async with sessions() as session:
        event = await session.scalar(select(AshbyWebhookEvent))
        assert event is not None and event.status == "processed" and event.external_entity_id == APPLICATION_ID
        assert event.event_key == f"{payload['webhookActionId']}:applicationSubmit"
        assert EMAIL not in json.dumps({column: str(getattr(event, column)) for column in ("event_key", "payload_sha256", "error_message")})


async def test_same_webhook_delivered_three_times_is_applied_once(
    anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession], ashby: FakeSupabaseAdmin
) -> None:
    payload = application_event()
    statuses = [(await deliver(anonymous, payload)).json()["status"] for _ in range(3)]
    assert statuses == ["processed", "duplicate", "duplicate"]
    assert await count(sessions, Candidate, Candidate.external_id == CANDIDATE_ID) == 1
    assert await count(sessions, Application, Application.external_id == APPLICATION_ID) == 1
    application = await application_row(sessions)
    assert (await timeline(sessions, application.id)).count("Application received") == 1
    assert await count(sessions, CandidateStageHistory, CandidateStageHistory.application_id == application.id) == 1
    assert await count(sessions, AIAnalysis, AIAnalysis.application_id == application.id) == 1
    assert len(ashby.invites) == 1
    assert await count(sessions, AshbyWebhookEvent) == 1


async def test_a_new_delivery_with_the_same_content_changes_nothing(
    anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession], ashby: FakeSupabaseAdmin
) -> None:
    """Ashby fires applicationUpdate alongside candidateStageChange with the same id and data."""
    when = datetime.now(UTC)
    await deliver(anonymous, application_event(updated_at=when - timedelta(hours=1)))
    action_id = str(uuid.uuid4())
    for action in ("candidateStageChange", "applicationUpdate"):
        payload = application_event(action, stage="Technical Interview", updated_at=when, webhook_action_id=action_id)
        assert (await deliver(anonymous, payload)).json()["status"] == "processed"
    application = await application_row(sessions)
    titles = await timeline(sessions, application.id)
    assert titles.count("Moved to Interview in Ashby") == 1
    assert await count(sessions, CandidateStageHistory, CandidateStageHistory.application_id == application.id) == 2


# Stage changes


async def test_stage_change_moves_the_application(anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession]) -> None:
    await deliver(anonymous, application_event(updated_at=ago(hours=2)))
    stage_change = application_event("candidateStageChange", stage="Technical Interview")
    assert (await deliver(anonymous, stage_change)).json()["status"] == "processed"
    application = await application_row(sessions)
    assert application.stage == "interview" and application.external_stage_title == "Technical Interview"
    async with sessions() as session:
        history = (
            await session.scalars(
                select(CandidateStageHistory)
                .where(CandidateStageHistory.application_id == application.id)
                .order_by(CandidateStageHistory.changed_at)
            )
        ).all()
    assert [(row.previous_stage, row.new_stage) for row in history] == [(None, "screening"), ("screening", "interview")]
    assert all(row.changed_by is None for row in history)  # changed in Ashby, not by a Talent Bridge user


async def test_an_older_event_never_reverts_a_newer_one(
    anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession]
) -> None:
    now = datetime.now(UTC)
    await deliver(anonymous, application_event(updated_at=now - timedelta(hours=3)))
    await deliver(anonymous, application_event("candidateStageChange", stage="Offer", updated_at=now))
    late = await deliver(
        anonymous, application_event("applicationUpdate", stage="Technical Interview", updated_at=now - timedelta(hours=1))
    )
    assert late.status_code == 200
    assert late.json() == {
        "status": "ignored",
        "action": "applicationUpdate",
        "detail": "Older than the version already applied.",
    }
    application = await application_row(sessions)
    assert application.stage == "offer"
    assert "Moved to Interview in Ashby" not in await timeline(sessions, application.id)


async def test_custom_stage_titles_can_be_mapped(
    anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "ashby_stage_title_map", {"take-home": "screening"})
    await deliver(anonymous, application_event(stage="Take-home"))
    application = await application_row(sessions)
    assert application.stage == "screening" and application.external_stage_type == "Custom"


async def test_an_unknown_stage_type_keeps_the_current_stage(
    anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession]
) -> None:
    await deliver(anonymous, application_event(stage="Technical Interview", updated_at=ago(hours=1)))
    await deliver(anonymous, application_event("candidateStageChange", stage="Take-home"))
    application = await application_row(sessions)
    assert application.stage == "interview"  # unmapped: nothing guessed
    assert application.external_stage_title == "Take-home"  # but Ashby's raw stage is kept


async def test_candidate_hire(anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession]) -> None:
    await deliver(anonymous, application_event(stage="Offer", updated_at=ago(hours=1)))
    hired = await deliver(anonymous, application_event("candidateHire", stage="Hired", status="Hired"))
    assert hired.json()["status"] == "processed"
    application = await application_row(sessions)
    assert application.stage == "hired" and application.archived_at is None and application.external_status == "Hired"
    assert "Moved to Hired in Ashby" in await timeline(sessions, application.id)


async def test_rejection_closes_the_application_without_storing_the_reason(
    anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession]
) -> None:
    secret_reason = "Internal: not enough distributed training depth"
    await deliver(anonymous, application_event(stage="Technical Interview", updated_at=ago(hours=1)))
    rejected = application_event(
        "candidateStageChange",
        stage="Archived",
        status="Archived",
        archive_reason_type="RejectedByOrg",
        archive_reason_text=secret_reason,
    )
    assert (await deliver(anonymous, rejected)).json()["status"] == "processed"
    application = await application_row(sessions)
    assert application.stage == "rejected" and application.archived_at is not None
    assert application.external_archive_reason_type == "RejectedByOrg"
    async with sessions() as session:
        stored = json.dumps(
            [
                [str(value) for value in row]
                for row in (await session.execute(select(CandidateActivity.title, CandidateActivity.description, CandidateActivity.meta))).all()
            ]
        )
    assert secret_reason not in stored


async def test_withdrawal_keeps_the_stage_and_closes_the_application(
    anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession]
) -> None:
    await deliver(anonymous, application_event(stage="Technical Interview", updated_at=ago(hours=1)))
    withdrawn = application_event(
        "applicationUpdate", stage="Archived", status="Archived", archive_reason_type="RejectedByCandidate"
    )
    await deliver(anonymous, withdrawn)
    application = await application_row(sessions)
    assert application.stage == "interview" and application.archived_at is not None
    assert "Archived in Ashby: Withdrawn by the candidate" in await timeline(sessions, application.id)

    # Reopened in Ashby: back in the pipeline, archive cleared.
    await deliver(anonymous, application_event("applicationUpdate", stage="Technical Interview"))
    application = await application_row(sessions)
    assert application.archived_at is None and application.external_archive_reason_type is None
    assert "Reopened in Ashby" in await timeline(sessions, application.id)


async def test_closed_job_reaches_its_applications(
    anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession]
) -> None:
    await deliver(anonymous, application_event())
    job_update = fixture("jobUpdate")
    job_update["data"]["job"]["updatedAt"] = iso(datetime.now(UTC))
    assert (await deliver(anonymous, job_update)).json()["status"] == "processed"
    async with sessions() as session:
        job = await session.scalar(select(Job).where(Job.external_id == JOB_ID))
        assert job is not None and job.status == "closed" and job.employment_type == "Full-time"

    # An older application payload doesn't rename a job Ashby has sent in full.
    await deliver(anonymous, application_event("applicationUpdate", job_title="Old title", updated_at=ago(days=1)))
    async with sessions() as session:
        job = await session.scalar(select(Job).where(Job.external_id == JOB_ID))
        assert job is not None and job.title == "TEST - ML Engineer"


# Interviews


async def test_interview_schedule_create_and_update(
    anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession]
) -> None:
    await deliver(anonymous, application_event(stage="Technical Interview", updated_at=ago(hours=1)))
    created = schedule_event(updated_at=ago(minutes=30))
    for _ in range(2):  # a redelivery adds nothing
        assert (await deliver(anonymous, created)).status_code == 200
    application = await application_row(sessions)
    async with sessions() as session:
        [interview] = (await session.scalars(select(Interview).where(Interview.application_id == application.id))).all()
    assert interview.title == "Technical Interview"  # the Ashby stage it belongs to
    assert interview.interviewers == ["Tom Reid"] and interview.duration_minutes == 60
    assert interview.meeting_url == "https://meet.example.com/ml-technical"
    assert interview.interview_type == "video" and interview.status == "scheduled"
    assert interview.notes is None  # Ashby feedback links are never imported
    assert (await timeline(sessions, application.id)).count("Technical Interview scheduled") == 1

    # The candidate confirms; then Ashby reschedules it, which needs a new confirmation.
    async with sessions() as session:
        row = await session.get(Interview, interview.id)
        assert row is not None
        row.confirmed_at = datetime.now(UTC)
        await session.commit()
    update = schedule_event("interviewScheduleUpdate", starts_in=timedelta(days=4), minutes=90)
    assert (await deliver(anonymous, update)).json()["status"] == "processed"
    async with sessions() as session:
        row = await session.get(Interview, interview.id)
        assert row is not None
    assert row.duration_minutes == 90 and row.confirmed_at is None
    assert row.interviewers == ["Tom Reid", "Ana Silva"]
    assert "Technical Interview rescheduled" in await timeline(sessions, application.id)

    cancelled = schedule_event("interviewScheduleUpdate", status="Cancelled", starts_in=timedelta(days=4), minutes=90)
    await deliver(anonymous, cancelled)
    async with sessions() as session:
        row = await session.get(Interview, interview.id)
        assert row is not None and row.status == "cancelled"
    assert "Technical Interview cancelled" in await timeline(sessions, application.id)
    assert await count(sessions, Interview, Interview.application_id == application.id) == 1


async def test_events_dropped_from_a_schedule_are_cancelled(
    anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession]
) -> None:
    await deliver(anonymous, application_event(updated_at=ago(hours=1)))
    await deliver(anonymous, schedule_event(updated_at=ago(minutes=30)))
    await deliver(anonymous, schedule_event("interviewScheduleUpdate", events=[]))
    application = await application_row(sessions)
    async with sessions() as session:
        [interview] = (await session.scalars(select(Interview).where(Interview.application_id == application.id))).all()
    assert interview.status == "cancelled"


async def test_an_interview_already_scheduled_here_is_adopted_not_duplicated(
    anonymous: AsyncClient, client: AsyncClient, sessions: async_sessionmaker[AsyncSession]
) -> None:
    await deliver(anonymous, application_event(updated_at=ago(hours=1)))
    application = await application_row(sessions)
    start = datetime.now(UTC).replace(microsecond=0) + timedelta(days=3)
    local = await client.post(
        f"{API}/applications/{application.id}/interviews",
        json={"title": "Technical interview", "scheduled_at": start.isoformat(), "duration_minutes": 60, "notes": "Recruiter brief"},
    )
    assert local.status_code == 201
    payload = schedule_event()
    event = payload["data"]["interviewSchedule"]["interviewEvents"][0]
    event["startTime"], event["endTime"] = iso(start), iso(start + timedelta(hours=1))
    await deliver(anonymous, payload)
    async with sessions() as session:
        [interview] = (await session.scalars(select(Interview).where(Interview.application_id == application.id))).all()
    assert interview.id == uuid.UUID(local.json()["id"])
    assert interview.external_id is not None and interview.notes == "Recruiter brief"


async def test_interview_for_an_application_not_synced_yet_is_retried(
    anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession]
) -> None:
    schedule = schedule_event()
    first = await deliver(anonymous, schedule)
    assert first.status_code == 503  # Ashby retries 5xx with backoff
    async with sessions() as session:
        event = await session.scalar(select(AshbyWebhookEvent))
        assert event is not None and event.status == "failed"
        assert "hasn't synced" in (event.error_message or "")

    await deliver(anonymous, application_event(updated_at=ago(hours=1)))
    retried = await deliver(anonymous, schedule)  # Ashby's retry of the same event
    assert retried.status_code == 200 and retried.json()["status"] == "processed"
    async with sessions() as session:
        event = await session.scalar(select(AshbyWebhookEvent).where(AshbyWebhookEvent.action == "interviewScheduleCreate"))
        assert event is not None and event.status == "processed" and event.attempts == 2
    assert await count(sessions, Interview, Interview.external_id.is_not(None)) == 1


# Everything else


async def test_unknown_actions_are_acknowledged_and_ignored(
    anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession]
) -> None:
    response = await deliver(anonymous, fixture("offerCreate"))
    assert response.status_code == 200
    assert response.json()["status"] == "ignored"
    async with sessions() as session:
        event = await session.scalar(select(AshbyWebhookEvent))
        assert event is not None and event.status == "ignored" and event.action == "offerCreate"


async def test_missing_optional_fields(anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession]) -> None:
    payload = application_event()
    application = payload["data"]["application"]
    for optional in ("createdAt", "source", "archiveReason", "archivedAt", "customFields", "hiringTeam", "creditedToUser"):
        application.pop(optional, None)
    application["currentInterviewStage"] = None
    application["candidate"].pop("primaryPhoneNumber")
    assert (await deliver(anonymous, payload)).json()["status"] == "processed"
    row = await application_row(sessions)
    assert row.stage == "sourced" and row.source == "Ashby"


async def test_a_candidate_without_an_email_is_skipped_safely(
    anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession]
) -> None:
    response = await deliver(anonymous, application_event(email=None))
    assert response.status_code == 200 and response.json()["status"] == "ignored"
    assert "no email" in response.json()["detail"]
    assert await count(sessions, Application, Application.external_id == APPLICATION_ID) == 0
    assert await count(sessions, Job, Job.external_id == JOB_ID) == 0


async def test_an_unreadable_payload_is_recorded_as_failed(
    anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession]
) -> None:
    payload = application_event()
    del payload["data"]["application"]["job"]
    response = await deliver(anonymous, payload)
    assert response.status_code == 200 and response.json()["status"] == "failed"
    async with sessions() as session:
        event = await session.scalar(select(AshbyWebhookEvent))
        assert event is not None and event.status == "failed"


async def test_a_database_failure_is_500_and_the_retry_applies_it(
    anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession], monkeypatch: pytest.MonkeyPatch
) -> None:
    original = importer.AshbyImporter.upsert_application
    calls = {"n": 0}

    async def flaky(self: importer.AshbyImporter, *args: Any, **kwargs: Any) -> Any:
        calls["n"] += 1
        if calls["n"] == 1:
            raise ConnectionResetError("database connection lost")
        return await original(self, *args, **kwargs)

    monkeypatch.setattr(importer.AshbyImporter, "upsert_application", flaky)
    payload = application_event()
    failed = await deliver(anonymous, payload)
    assert failed.status_code == 500
    assert failed.json()["error"]["code"] == "ashby_webhook_failed"
    assert "database connection lost" not in failed.text  # nothing internal leaks
    assert await count(sessions, Application, Application.external_id == APPLICATION_ID) == 0

    retried = await deliver(anonymous, payload)
    assert retried.json()["status"] == "processed"
    assert await count(sessions, Application, Application.external_id == APPLICATION_ID) == 1
    assert await count(sessions, Candidate, Candidate.external_id == CANDIDATE_ID) == 1


async def test_ai_failure_never_fails_the_import(
    anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession]
) -> None:
    class BrokenProvider(MockProvider):
        name = "broken"

        async def analyze_candidate(self, context: Any) -> Any:
            raise RuntimeError("Groq is down")

    app.dependency_overrides[get_ai_provider] = BrokenProvider
    response = await deliver(anonymous, application_event())
    assert response.json()["status"] == "processed"
    assert await count(sessions, Application, Application.external_id == APPLICATION_ID) == 1
    application = await application_row(sessions)
    assert await count(sessions, AIAnalysis, AIAnalysis.application_id == application.id) == 0


async def test_groq_unavailable_falls_back_and_still_imports(
    anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession]
) -> None:
    unavailable = httpx.MockTransport(lambda request: httpx.Response(503, json={"error": "over capacity"}))
    app.dependency_overrides[get_ai_provider] = lambda: GroqProvider(api_key="k", model="llama", transport=unavailable)
    assert (await deliver(anonymous, application_event())).json()["status"] == "processed"
    application = await application_row(sessions)
    async with sessions() as session:
        analysis = await session.scalar(select(AIAnalysis).where(AIAnalysis.application_id == application.id))
    assert analysis is not None and analysis.model_name == "mock (fallback from groq)"


async def test_auto_analysis_can_be_turned_off(
    anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "ashby_auto_analyze", False)
    await deliver(anonymous, application_event())
    assert await count(sessions, AIAnalysis) == 0


async def test_candidate_merge_relinks_the_candidate(
    anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession]
) -> None:
    gone = "6e1d4c8b-0f3a-4b2e-9d7c-3a5f7b9d1e23"
    await deliver(anonymous, application_event(candidate_id=gone))
    merge = fixture("candidateMerge")
    assert (await deliver(anonymous, merge)).json()["status"] == "processed"
    async with sessions() as session:
        candidate = await session.scalar(select(Candidate).where(Candidate.email == EMAIL))
        assert candidate is not None and candidate.external_id == CANDIDATE_ID


async def test_an_application_already_closed_on_arrival_explains_itself(
    anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession]
) -> None:
    """A sync of past candidates, or a webhook missed until the application was archived."""
    closed = application_event("applicationUpdate", stage="Archived", status="Archived", archive_reason_type="RejectedByOrg")
    await deliver(anonymous, closed)
    application = await application_row(sessions)
    assert application.stage == "rejected"
    assert await timeline(sessions, application.id) == ["Application received", "Archived in Ashby: not selected"]
    async with sessions() as session:
        [entry] = (
            await session.scalars(
                select(CandidateActivity).where(
                    CandidateActivity.application_id == application.id, CandidateActivity.activity_type == "application_closed"
                )
            )
        ).all()
    from app.services.candidate_visibility import present_activity

    shown = present_activity(entry, {})
    assert shown is not None and shown.title == "No longer under consideration"
