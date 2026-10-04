"""The Ashby API client, the reconciliation sync and integration health."""

import uuid
from datetime import timedelta
from typing import Any

import httpx
import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import settings
from app.integrations.ashby.client import AshbyClient, AshbyError, AshbyRestartSync, get_ashby_client
from app.integrations.ashby.sync import AshbySync
from app.main import app
from app.models import Application, AshbySyncState, Candidate, Interview, Job
from tests.ashby_support import (
    APPLICATION_ID,
    EMAIL,
    JOB_ID,
    FakeAshbyAPI,
    FakeSupabaseAdmin,
    ago,
    application_event,
    deliver,
    fixture,
    iso,
    schedule_event,
)
from tests.conftest import API


async def no_sleep(_: float) -> None:
    return None


def client_for(api: FakeAshbyAPI) -> AshbyClient:
    return AshbyClient("test-key", transport=api.transport(), sleep=no_sleep)


def application_record(**changes: Any) -> dict[str, Any]:
    return application_event(**changes)["data"]["application"]


def job_record(job_id: str = JOB_ID, title: str = "TEST - ML Engineer", status: str = "Open") -> dict[str, Any]:
    job = fixture("jobUpdate")["data"]["job"]
    job.update(id=job_id, title=title, status=status, updatedAt=iso(ago(seconds=1)))
    return job


async def count(sessions: async_sessionmaker[AsyncSession], model: Any, *where: Any) -> int:
    async with sessions() as session:
        return await session.scalar(select(func.count()).select_from(model).where(*where)) or 0


# The client


async def test_lists_every_page_and_returns_the_sync_token() -> None:
    api = FakeAshbyAPI()
    for index in range(5):
        api.add("job.list", job_record(job_id=str(uuid.uuid4()), title=f"Job {index}"))
    listed = await client_for(api).list_all("job.list")
    assert [job["title"] for job in listed.results] == [f"Job {index}" for index in range(5)]
    assert listed.sync_token == "job.list:5"
    assert [body.get("cursor") for _, body in api.calls] == [None, "2", "4"]

    api.add("job.list", job_record(job_id=str(uuid.uuid4()), title="Job 5"))
    changed = await client_for(api).list_all("job.list", sync_token=listed.sync_token)
    assert [job["title"] for job in changed.results] == ["Job 5"]
    assert all(body["syncToken"] == listed.sync_token for _, body in api.calls[-1:])


@pytest.mark.parametrize(
    ("status", "payload", "code"),
    [
        (200, {"success": False, "errorInfo": {"code": "application_not_found", "message": "Not found"}}, "application_not_found"),
        (200, {"success": False, "errors": ["invalid_input"]}, "invalid_input"),
        (200, {"success": False, "errors": [{"code": "bad_cursor", "message": "No"}]}, "bad_cursor"),
        (400, {"success": False, "errors": [{"message": "limit must be <= 100", "parameter": "limit"}]}, "limit must be <= 100"),
    ],
)
async def test_both_documented_error_formats_are_understood(status: int, payload: dict[str, Any], code: str) -> None:
    api = FakeAshbyAPI()
    api.fail["application.info"] = (status, payload)
    with pytest.raises(AshbyError) as error:
        await client_for(api).application_info("x")
    assert error.value.code == code
    assert "test-key" not in str(error.value)


@pytest.mark.parametrize(
    "payload",
    [
        {"success": False, "errors": ["sync_token_expired"], "errorInfo": {"code": "sync_token_expired", "message": "x"}},
        {"success": False, "errors": [{"code": "incremental_sync_too_large", "message": "Too many pages"}]},
    ],
)
async def test_unusable_sync_tokens_ask_for_a_full_sync(payload: dict[str, Any]) -> None:
    api = FakeAshbyAPI()
    api.fail["job.list"] = (200, payload)
    with pytest.raises(AshbyRestartSync):
        await client_for(api).list_all("job.list", sync_token="old")


async def test_missing_permissions_name_the_permission() -> None:
    api = FakeAshbyAPI()
    api.fail["interviewSchedule.list"] = (403, {"success": False})
    with pytest.raises(AshbyError, match="interviewsRead"):
        await client_for(api).list_all("interviewSchedule.list")
    api.fail["application.list"] = (
        200,
        {"success": False, "errorInfo": {"code": "missing_endpoint_permission", "message": "Missing permission"}},
    )
    with pytest.raises(AshbyError, match="candidatesRead"):
        await client_for(api).list_all("application.list")


async def test_rate_limits_and_outages_are_retried() -> None:
    attempts: list[int] = []

    def flaky(request: httpx.Request) -> httpx.Response:
        attempts.append(1)
        if len(attempts) == 1:
            return httpx.Response(429, headers={"Retry-After": "1"})
        if len(attempts) == 2:
            return httpx.Response(502)
        return httpx.Response(200, json={"success": True, "results": {"title": "Key"}})

    client = AshbyClient("k", transport=httpx.MockTransport(flaky), sleep=no_sleep)
    assert await client.api_key_info() == {"title": "Key"}
    assert len(attempts) == 3


async def test_ashby_unavailable_fails_cleanly() -> None:
    def down(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused")

    client = AshbyClient("k", transport=httpx.MockTransport(down), sleep=no_sleep)
    with pytest.raises(AshbyError, match="Couldn't reach Ashby"):
        await client.list_all("job.list")
    assert "k" not in repr(client).replace("base_url", "").replace("ashbyhq", "")


# The sync


def sync_for(sessions: async_sessionmaker[AsyncSession], api: FakeAshbyAPI, admin: FakeSupabaseAdmin | None = None) -> AshbySync:
    return AshbySync(sessions, client_for(api), admin=admin, invite_max_age=timedelta(days=14))  # type: ignore[arg-type]


@pytest.fixture
def ashby_api() -> FakeAshbyAPI:
    api = FakeAshbyAPI()
    api.add("job.list", job_record())
    api.add("job.list", job_record(job_id="9b8c7d6e-5f4a-4b3c-8d2e-1f0a9b8c7d6e", title="TEST - Data Engineer"))
    api.add("application.list", application_record(updated_at=ago(hours=5)))
    api.add(
        "application.list",
        application_record(
            application_id="d3b7f2e5-1c2a-4f9b-8e4d-0a6c8b1f2d3e",
            job_id="9b8c7d6e-5f4a-4b3c-8d2e-1f0a9b8c7d6e",
            job_title="TEST - Data Engineer",
            stage="Technical Interview",
            updated_at=ago(hours=4),
        ),
    )
    api.add(
        "application.list",
        application_record(
            application_id=str(uuid.uuid4()),
            candidate_id=str(uuid.uuid4()),
            email="old.applicant@example.com",
            name="Old Applicant",
            created_at=ago(days=60),
            updated_at=ago(days=59),
        ),
    )
    schedule = schedule_event(application_id=APPLICATION_ID)["data"]["interviewSchedule"]
    api.add("interviewSchedule.list", schedule)
    return api


async def test_full_sync_imports_without_duplicates(
    sessions: async_sessionmaker[AsyncSession], ashby_api: FakeAshbyAPI
) -> None:
    admin = FakeSupabaseAdmin()
    report = await sync_for(sessions, ashby_api, admin).run()
    by_resource = {item.resource: item for item in report.resources}
    assert by_resource["jobs"].created == 2 and by_resource["jobs"].full_sync
    assert by_resource["applications"].created == 3
    assert by_resource["interviews"].updated == 1
    assert by_resource["candidates"].fetched == 0

    assert await count(sessions, Candidate, Candidate.email == EMAIL) == 1  # two applications, one person
    taylor = await count(sessions, Application, Application.external_id.is_not(None))
    assert taylor == 3
    assert await count(sessions, Interview, Interview.external_id.is_not(None)) == 1
    # Only the recent applicant is invited: a first sync never emails a backlog of past candidates.
    assert [invite["email"] for invite in admin.invites] == [EMAIL]
    async with sessions() as session:
        old = await session.scalar(select(Candidate).where(Candidate.email == "old.applicant@example.com"))
        assert old is not None and old.portal_status == "not_required"
        states = {state.resource: state for state in await session.scalars(select(AshbySyncState))}
    assert states["applications"].sync_token == f"application.list:{ashby_api.version}"
    assert states["applications"].last_success_at is not None


async def test_incremental_sync_fetches_only_changes(
    sessions: async_sessionmaker[AsyncSession], ashby_api: FakeAshbyAPI
) -> None:
    sync = sync_for(sessions, ashby_api)
    await sync.run()
    again = {item.resource: item for item in (await sync.run()).resources}
    assert all(item.fetched == 0 for item in again.values())
    assert not again["applications"].full_sync

    ashby_api.add("application.list", application_record(stage="Offer", updated_at=ago(minutes=1)))
    changed = await sync.sync_resource("applications")
    assert (changed.fetched, changed.updated, changed.created) == (1, 1, 0)
    async with sessions() as session:
        application = await session.scalar(select(Application).where(Application.external_id == APPLICATION_ID))
        assert application is not None and application.stage == "offer"
    assert await count(sessions, Application, Application.external_id.is_not(None)) == 3


async def test_an_expired_sync_token_falls_back_to_a_full_sync(
    sessions: async_sessionmaker[AsyncSession], ashby_api: FakeAshbyAPI
) -> None:
    sync = sync_for(sessions, ashby_api)
    await sync.run()
    async with sessions() as session:
        state = await session.get(AshbySyncState, "applications")
        assert state is not None and state.sync_token
        ashby_api.expired_tokens.add(state.sync_token)
    report = await sync.sync_resource("applications")
    assert report.full_sync and report.fetched == 3 and report.created == 0 and report.error is None
    assert await count(sessions, Application, Application.external_id.is_not(None)) == 3


@pytest.mark.usefixtures("ashby")
async def test_sync_after_webhooks_repairs_without_duplicating(
    anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession], ashby_api: FakeAshbyAPI
) -> None:
    await deliver(anonymous, application_event(updated_at=ago(hours=5)))  # the webhook got there first
    report = await sync_for(sessions, ashby_api).run()
    applications = next(item for item in report.resources if item.resource == "applications")
    assert (applications.created, applications.unchanged) == (2, 1)
    assert await count(sessions, Candidate, Candidate.email == EMAIL) == 1
    assert await count(sessions, Job, Job.external_id == JOB_ID) == 1


async def test_ashby_down_is_recorded_and_other_resources_still_sync(
    client: AsyncClient, sessions: async_sessionmaker[AsyncSession], ashby_api: FakeAshbyAPI
) -> None:
    ashby_api.fail["job.list"] = (503, {})
    report = await sync_for(sessions, ashby_api).run()
    jobs = next(item for item in report.resources if item.resource == "jobs")
    assert jobs.error and "unavailable" in jobs.error
    applications = next(item for item in report.resources if item.resource == "applications")
    assert applications.created == 3  # jobs came in with their applications
    status = (await client.get(f"{API}/integrations/ashby/status")).json()
    assert status["last_error"].startswith("Sync of jobs: Ashby is unavailable")


async def test_candidates_pass_refreshes_known_people_only(
    sessions: async_sessionmaker[AsyncSession], ashby_api: FakeAshbyAPI
) -> None:
    await sync_for(sessions, ashby_api).run()
    candidate = application_record()["candidate"]
    candidate.update(position="Staff ML Engineer", company="Acme", updatedAt=iso(ago(seconds=1)))
    candidate["location"] = {"locationSummary": "Berlin, Germany"}
    stranger = {"id": str(uuid.uuid4()), "name": "Lead Only", "primaryEmailAddress": {"value": "lead@example.com"}}
    ashby_api.add("candidate.list", candidate)
    ashby_api.add("candidate.list", stranger)
    report = await sync_for(sessions, ashby_api).sync_resource("candidates")
    assert (report.updated, report.unchanged) == (1, 1)
    async with sessions() as session:
        taylor = await session.scalar(select(Candidate).where(Candidate.email == EMAIL))
        assert taylor is not None and taylor.headline == "Staff ML Engineer at Acme" and taylor.location == "Berlin, Germany"
        assert await session.scalar(select(Candidate).where(Candidate.email == "lead@example.com")) is None


# The endpoints


async def test_sync_endpoint(client: AsyncClient, sessions: async_sessionmaker[AsyncSession], ashby_api: FakeAshbyAPI) -> None:
    unconfigured = await client.post(f"{API}/integrations/ashby/sync")
    assert unconfigured.status_code == 503 and unconfigured.json()["error"]["code"] == "ashby_not_configured"

    app.dependency_overrides[get_ashby_client] = lambda: client_for(ashby_api)
    response = await client.post(f"{API}/integrations/ashby/sync")
    assert response.status_code == 200
    assert [item["resource"] for item in response.json()["resources"]] == ["jobs", "candidates", "applications", "interviews"]
    again = await client.post(f"{API}/integrations/ashby/sync")
    assert all(item["created"] == 0 for item in again.json()["resources"])
    assert await count(sessions, Application, Application.external_id.is_not(None)) == 3


async def test_status_endpoint(client: AsyncClient, monkeypatch: pytest.MonkeyPatch, ashby_api: FakeAshbyAPI) -> None:
    monkeypatch.setattr(settings, "ashby_webhook_secret", None)
    disconnected = (await client.get(f"{API}/integrations/ashby/status")).json()
    assert disconnected["status"] == "disconnected"
    assert disconnected["api_key_configured"] is False and disconnected["last_webhook_at"] is None

    app.dependency_overrides[get_ashby_client] = lambda: client_for(ashby_api)
    connected = (await client.get(f"{API}/integrations/ashby/status", params={"check": True})).json()
    assert connected["status"] == "connected" and connected["api_key_configured"] is True

    ashby_api.fail["apiKey.info"] = (401, {})
    broken = (await client.get(f"{API}/integrations/ashby/status", params={"check": True})).json()
    assert broken["status"] == "error" and "test-key" not in str(broken)
