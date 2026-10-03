"""Each test gets a fresh in-memory SQLite database loaded with the demo pipeline."""

import os

# Settings are read on import, and real environment variables win over backend/.env.
os.environ.update(
    DATABASE_URL="sqlite+aiosqlite://",
    AI_PROVIDER="mock",
    SEED_DEMO_DATA="false",
    ENVIRONMENT="test",
)

from collections.abc import AsyncIterator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.database import create_engine_for, create_tables, get_session
from app.db.seed import load_seed, seed_id
from app.main import app
from app.services.ai.client import get_ai_provider
from app.services.ai.fallback import MockProvider

API = "/api/v1"


def application_id(key: str) -> str:
    return str(seed_id("application", key))


def candidate_id(key: str) -> str:
    return str(seed_id("candidate", key))


def job_id(title: str) -> str:
    return str(seed_id("job", title))


@pytest.fixture
async def sessions() -> AsyncIterator[async_sessionmaker[AsyncSession]]:
    engine = create_engine_for("sqlite+aiosqlite://")
    await create_tables(engine)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        await load_seed(session)
    yield factory
    await engine.dispose()


@pytest.fixture
async def client(sessions: async_sessionmaker[AsyncSession]) -> AsyncIterator[AsyncClient]:
    async def session_override() -> AsyncIterator[AsyncSession]:
        async with sessions() as session:
            yield session

    app.dependency_overrides[get_session] = session_override
    app.dependency_overrides[get_ai_provider] = MockProvider
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as http:
        yield http
    app.dependency_overrides.clear()
