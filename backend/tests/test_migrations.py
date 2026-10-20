"""The SQL migrations (supabase/migrations) against the models, on real Postgres.

Every other test builds its schema from the models (Base.metadata), so a model that gets ahead of the
migrations passes them and then fails on Supabase. That happened: the backend gained jobs.company_id and
the companies table, the Supabase database didn't have migration 017 yet, and GET /candidates returned
500, relation "companies" does not exist. These tests build databases from the migrations instead.

Postgres only: set TALENT_BRIDGE_TEST_POSTGRES_URL (see tests/conftest.py). Each test creates and drops
its own database next to that one.
"""

import uuid
from collections.abc import AsyncIterator, Awaitable, Callable
from pathlib import Path

import asyncpg
import pytest
from httpx import AsyncClient
from sqlalchemy import make_url
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import normalize_database_url
from app.core.database import create_engine_for, get_session
from app.db.seed import seed_id
from app.main import app
from app.models import Base
from app.services.account_service import link_account
from app.services.candidate_service import list_pipeline
from tests.conftest import ALEX_AUTH, ALEX_EMAIL, API, AUTH_SCHEMA, POSTGRES_URL, bearer

pytestmark = pytest.mark.skipif(not POSTGRES_URL, reason="needs TALENT_BRIDGE_TEST_POSTGRES_URL")

MIGRATIONS = sorted((Path(__file__).parents[2] / "supabase" / "migrations").glob("*.sql"))
BEFORE_COMPANIES = [m for m in MIGRATIONS if m.name < "017"]
COMPANIES = [m for m in MIGRATIONS if m.name.startswith("017")]
ENCORD = seed_id("company", "encord")

Apply = Callable[[list[Path]], Awaitable[None]]


def _dsn(database: str) -> str:
    return (
        make_url(normalize_database_url(POSTGRES_URL or ""))
        .set(drivername="postgresql", database=database)
        .render_as_string(hide_password=False)
    )


@pytest.fixture
async def database() -> AsyncIterator[tuple[str, asyncpg.Connection, Apply]]:
    """A new, empty database (with Supabase's auth.users stub), a connection to it, and a function that
    applies migration files to it in order."""
    name = f"tb_migrations_{uuid.uuid4().hex[:8]}"
    admin = await asyncpg.connect(_dsn("postgres"))
    await admin.execute(f'create database "{name}"')
    connection = await asyncpg.connect(_dsn(name))
    for statement in AUTH_SCHEMA:
        await connection.execute(statement)

    async def apply(files: list[Path]) -> None:
        for path in files:
            async with connection.transaction():
                await connection.execute(path.read_text(encoding="utf-8"))

    try:
        yield name, connection, apply
    finally:
        await connection.close()
        await admin.execute(f'drop database "{name}" with (force)')
        await admin.close()


async def test_the_migrations_create_everything_the_models_use(
    database: tuple[str, asyncpg.Connection, Apply],
) -> None:
    _, connection, apply = database
    await apply(MIGRATIONS)
    rows = await connection.fetch(
        "select table_name, column_name, is_nullable from information_schema.columns where table_schema = 'public'"
    )
    live = {(row["table_name"], row["column_name"]): row["is_nullable"] == "YES" for row in rows}
    problems = []
    for table in Base.metadata.sorted_tables:
        for column in table.columns:
            if (table.name, column.name) not in live:
                problems.append(f"{table.name}.{column.name} is in the models but no migration creates it")
            elif not column.primary_key and live[(table.name, column.name)] != column.nullable:
                problems.append(
                    f"{table.name}.{column.name}: nullable is {column.nullable} in the model, not in the database"
                )
    assert problems == []


# The schema before 017, with what a recruiter workspace had then: a job without a company, a candidate
# applying to it, their timeline and an interview.
JOB, CANDIDATE, APPLICATION = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
LEGACY_ROWS = f"""
insert into auth.users (id, email) values ('{ALEX_AUTH}', '{ALEX_EMAIL}');
insert into public.users (id, email, full_name, role) values ('{uuid.uuid4()}', '{ALEX_EMAIL}', 'Alex Chen', 'recruiter');
insert into public.jobs (id, title, status) values ('{JOB}', 'Product Designer', 'open');
insert into public.candidates (id, first_name, last_name, email) values ('{CANDIDATE}', 'Sophia', 'Martinez', 'sophia@example.com');
insert into public.applications (id, candidate_id, job_id, stage) values ('{APPLICATION}', '{CANDIDATE}', '{JOB}', 'interview');
insert into public.candidate_activity (application_id, activity_type, title) values ('{APPLICATION}', 'stage_changed', 'Moved to Interview');
insert into public.interviews (application_id, title, scheduled_at) values ('{APPLICATION}', 'Design interview', now() + interval '1 day');
"""


async def test_the_pipeline_works_on_a_database_upgraded_through_017(
    database: tuple[str, asyncpg.Connection, Apply], anonymous: AsyncClient
) -> None:
    name, connection, apply = database
    await apply(BEFORE_COMPANIES)
    await connection.execute(LEGACY_ROWS)
    engine = create_engine_for(normalize_database_url(_dsn(name)))
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    try:
        # The original failure: today's backend on a database without 017.
        async with sessions() as session:
            with pytest.raises(ProgrammingError, match='relation "companies" does not exist'):
                await list_pipeline(session, limit=200)

        await apply(COMPANIES)
        async with sessions() as session:
            await link_account(session, ALEX_EMAIL, ALEX_AUTH)

        async def session_override() -> AsyncIterator[AsyncSession]:
            async with sessions() as session:
                yield session

        app.dependency_overrides[get_session] = session_override
        response = await anonymous.get(f"{API}/candidates", params={"limit": 200}, headers=bearer(ALEX_AUTH))
        assert response.status_code == 200, response.text
        page = response.json()
        assert page["total"] == 1
        [item] = page["items"]
        # Nothing lost: the person, their application, its job, timeline and interview are all still joined up.
        assert item["application_id"] == str(APPLICATION) and item["candidate"]["id"] == str(CANDIDATE)
        assert item["job"]["title"] == "Product Designer" and item["stage"] == "interview"
        assert item["last_activity"]["title"] == "Moved to Interview"
        assert item["next_interview"]["title"] == "Design interview"
        # The existing job now belongs to the workspace's company.
        assert await connection.fetchval(f"select company_id from public.jobs where id = '{JOB}'") == ENCORD
    finally:
        await engine.dispose()


async def test_a_job_written_without_a_company_gets_the_workspaces(
    database: tuple[str, asyncpg.Connection, Apply],
) -> None:
    """A backend still on the previous release inserts jobs without company_id; 017 must not break it."""
    _, connection, apply = database
    await apply(BEFORE_COMPANIES)
    await connection.execute(LEGACY_ROWS)
    await apply(COMPANIES)
    job = await connection.fetchval("insert into public.jobs (title, status) values ('QA tester', 'open') returning id")
    assert await connection.fetchval("select company_id from public.jobs where id = $1", job) == ENCORD


async def test_with_no_company_at_all_a_job_without_one_is_refused(
    database: tuple[str, asyncpg.Connection, Apply],
) -> None:
    """An empty database gets its companies from the seed; until then, no company is invented."""
    _, connection, apply = database
    await apply(MIGRATIONS)
    with pytest.raises(asyncpg.NotNullViolationError):
        await connection.execute("insert into public.jobs (title, status) values ('QA tester', 'open')")
