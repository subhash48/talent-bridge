"""100 Ashby webhook deliveries at once, duplicates included, on a database with real concurrent
connections: no duplicate people, applications, invitations or timeline entries.

Runs on a SQLite file by default. Set TALENT_BRIDGE_TEST_POSTGRES_URL to a throwaway Postgres
database (its tables are dropped and recreated) to run the same load there too.
"""

import asyncio
import os
import random
import statistics
import time
import uuid
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

import httpx
import pytest
from httpx import ASGITransport
from pydantic import SecretStr
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import normalize_database_url, settings
from app.core.database import create_engine_for, get_session, get_session_factory
from app.integrations.ashby.client import get_ashby_client
from app.integrations.supabase_admin import get_supabase_admin
from app.main import app
from app.models import (
    Application,
    AshbyWebhookEvent,
    Base,
    Candidate,
    CandidateActivity,
    CandidateStageHistory,
    Job,
    User,
)
from app.services.ai.client import get_ai_provider
from app.services.ai.fallback import MockProvider
from tests.ashby_support import SECRET, WEBHOOK, FakeSupabaseAdmin, ago, application_event, sign
from tests.conftest import AUTH_SCHEMA

POSTGRES = os.environ.get("TALENT_BRIDGE_TEST_POSTGRES_URL")
CANDIDATES, JOBS_EACH, DELIVERIES, CONCURRENCY = 20, 2, 100, 25


@pytest.fixture(params=["sqlite", *(["postgres"] if POSTGRES else [])])
async def database(request: pytest.FixtureRequest, tmp_path: Path) -> AsyncIterator[async_sessionmaker[AsyncSession]]:
    if request.param == "sqlite":
        engine = create_engine_for(f"sqlite+aiosqlite:///{tmp_path / 'load.db'}")
    else:
        assert POSTGRES is not None
        engine = create_engine_for(normalize_database_url(POSTGRES))
        async with engine.begin() as connection:
            for statement in AUTH_SCHEMA:
                await connection.execute(text(statement))
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
        await connection.run_sync(Base.metadata.create_all)
    yield async_sessionmaker(engine, expire_on_commit=False)
    await engine.dispose()


async def test_100_concurrent_deliveries_with_duplicates(
    database: async_sessionmaker[AsyncSession], monkeypatch: pytest.MonkeyPatch
) -> None:
    async def session_override() -> AsyncIterator[AsyncSession]:
        async with database() as session:
            yield session

    admin = FakeSupabaseAdmin()
    monkeypatch.setattr(settings, "ashby_webhook_secret", SecretStr(SECRET))
    monkeypatch.setattr(settings, "portal_invites_enabled", True)
    app.dependency_overrides.update(
        {
            get_session: session_override,
            get_session_factory: lambda: database,
            get_ai_provider: MockProvider,
            get_supabase_admin: lambda: admin,
            get_ashby_client: lambda: None,
        }
    )

    # 20 people, each applying to 2 jobs (40 applications), each delivered once or more: some as
    # applicationSubmit plus a stage change, some redelivered by Ashby's retries.
    rng = random.Random(7)
    jobs = [str(uuid.uuid4()) for _ in range(JOBS_EACH)]
    unique: list[dict] = []
    for person in range(CANDIDATES):
        candidate = str(uuid.uuid4())
        for index, job in enumerate(jobs):
            application = str(uuid.uuid4())
            base = {
                "application_id": application, "candidate_id": candidate, "email": f"load.{person}@example.com",
                "name": f"Load Tester{person}", "job_id": job, "job_title": f"TEST - Load job {index}",
            }  # fmt: skip
            unique.append(application_event(updated_at=ago(hours=2), **base))
            unique.append(application_event("candidateStageChange", stage="Technical Interview", updated_at=ago(hours=1), **base))
    deliveries = unique + [rng.choice(unique) for _ in range(DELIVERIES - len(unique))]
    rng.shuffle(deliveries)
    assert len(deliveries) == DELIVERIES

    # Time until the response starts: what Ashby waits for. Invitations and AI analysis run after it
    # as background tasks (the in-process test transport waits for those too, so they're excluded).
    timings: list[float] = []

    async def timed_app(scope: Any, receive: Any, send: Any) -> None:
        started = time.perf_counter()

        async def send_timed(message: Any) -> None:
            if message["type"] == "http.response.start":
                timings.append(time.perf_counter() - started)
            await send(message)

        await app(scope, receive, send_timed)

    statuses: list[int] = []
    gate = asyncio.Semaphore(CONCURRENCY)

    async def send(http: httpx.AsyncClient, payload: dict) -> None:
        import json

        body = json.dumps(payload).encode()
        headers = {"Ashby-Signature": sign(body), "Content-Type": "application/json"}
        for _ in range(10):  # Ashby retries anything that isn't 2xx
            async with gate:
                response = await http.post(WEBHOOK, content=body, headers=headers)
            statuses.append(response.status_code)
            if response.status_code < 300:
                return
            await asyncio.sleep(0.05)
        raise AssertionError(f"never delivered: {response.status_code} {response.text}")

    try:
        async with httpx.AsyncClient(transport=ASGITransport(app=timed_app), base_url="http://test") as http:
            await asyncio.gather(*(send(http, payload) for payload in deliveries))
    finally:
        app.dependency_overrides.clear()

    async with database() as session:
        async def total(model: type, *where: object) -> int:
            return await session.scalar(select(func.count()).select_from(model).where(*where)) or 0

        assert await total(Candidate) == CANDIDATES
        assert await total(User) == CANDIDATES
        assert await total(Job) == JOBS_EACH
        assert await total(Application) == CANDIDATES * JOBS_EACH
        assert await total(Application, Application.stage != "interview") == 0  # the newest state won
        # Per application: received once; moved at most once (not at all if the stage change arrived
        # first, when the late submit was ignored as older); history matches the timeline exactly.
        for application_id in (await session.scalars(select(Application.id))).all():
            mine = CandidateActivity.application_id == application_id
            received = await total(CandidateActivity, mine, CandidateActivity.title == "Application received")
            moved = await total(CandidateActivity, mine, CandidateActivity.title == "Moved to Interview in Ashby")
            history = await total(CandidateStageHistory, CandidateStageHistory.application_id == application_id)
            assert (received, history) == (1, 1 + moved) and moved <= 1
        assert await total(AshbyWebhookEvent) == len(unique)  # each event recorded once, however often delivered
        assert await total(AshbyWebhookEvent, AshbyWebhookEvent.status.not_in(["processed", "ignored"])) == 0
    assert len(admin.invites) == CANDIDATES  # one per person, however many applications and deliveries
    assert sorted({invite["email"] for invite in admin.invites}) == sorted(f"load.{n}@example.com" for n in range(CANDIDATES))

    p50, p95 = statistics.median(timings), statistics.quantiles(timings, n=20)[-1]
    retried = sum(1 for status in statuses if status >= 300)
    print(f"\n{len(deliveries)} deliveries, {retried} retried: p50 {p50 * 1000:.0f} ms, p95 {p95 * 1000:.0f} ms")
    assert all(status in (200, 500, 503) for status in statuses)
    assert p95 < 5.0
