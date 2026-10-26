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
BEFORE_MESSAGING = [m for m in MIGRATIONS if m.name < "018"]
MESSAGING = [m for m in MIGRATIONS if m.name.startswith("018")]
WORKSPACES = [m for m in MIGRATIONS if m.name.startswith("019")]
SIMPLE_HIRE = [m for m in MIGRATIONS if m.name.startswith("020")]
LATER = [m for m in MIGRATIONS if m.name >= "020"]
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


async def test_the_pipeline_works_on_a_database_upgraded_through_the_latest(
    database: tuple[str, asyncpg.Connection, Apply], anonymous: AsyncClient
) -> None:
    name, connection, apply = database
    await apply(BEFORE_COMPANIES)
    await connection.execute(LEGACY_ROWS)
    engine = create_engine_for(normalize_database_url(_dsn(name)))
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    try:
        # The original failure: today's backend on a database without 017 (or, now, 018).
        async with sessions() as session:
            with pytest.raises(
                ProgrammingError, match='companies" does not exist|candidate_messaging_enabled does not exist'
            ):
                await list_pipeline(session, limit=200)

        await apply(COMPANIES)
        # Today's backend reads candidate messaging too: deploying it before 018 fails the same way.
        async with sessions() as session:
            with pytest.raises(ProgrammingError, match="candidate_messaging_enabled"):
                await list_pipeline(session, limit=200)
        await apply(MESSAGING)
        # And it reads which company a recruiter hires for: deploying it before 019 fails too.
        async with sessions() as session:
            with pytest.raises(ProgrammingError, match="company_id does not exist"):
                await link_account(session, ALEX_EMAIL, ALEX_AUTH)
        await apply([*WORKSPACES, *LATER])
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
        # The existing job now belongs to the workspace's company, and so does Alex.
        assert await connection.fetchval(f"select company_id from public.jobs where id = '{JOB}'") == ENCORD
        assert await connection.fetchval(f"select company_id from public.users where email = '{ALEX_EMAIL}'") == ENCORD
        assert item["candidate_messaging_enabled"] is False  # no conversation yet, so it waits for a recruiter
    finally:
        await engine.dispose()


async def test_018_keeps_open_the_conversations_candidates_already_took_part_in(
    database: tuple[str, asyncpg.Connection, Apply],
) -> None:
    _, connection, apply = database
    await apply(BEFORE_COMPANIES)
    await connection.execute(LEGACY_ROWS)
    await apply([m for m in BEFORE_MESSAGING if m.name >= "017"])
    other, other_application = uuid.uuid4(), uuid.uuid4()
    await connection.execute(
        f"""
        insert into public.candidates (id, first_name, last_name, email) values ('{other}', 'Maya', 'Brooks', 'maya@example.com');
        insert into public.applications (id, candidate_id, job_id, stage) values ('{other_application}', '{other}', '{JOB}', 'screening');
        insert into public.messages (application_id, sender_type, content) values ('{APPLICATION}', 'candidate', 'Hi Alex!');
        insert into public.messages (application_id, sender_type, content) values ('{other_application}', 'recruiter', 'Thanks for applying.');
        """
    )
    await apply(MESSAGING)
    flags = dict(await connection.fetch("select id, candidate_messaging_enabled from public.applications"))
    # Sophia had written: still open. Maya has only heard from the team: she waits for a recruiter.
    assert (flags[APPLICATION], flags[other_application]) == (True, False)
    # Every application made from now on starts with messaging off.
    default = await connection.fetchrow(
        "select column_default, is_nullable from information_schema.columns"
        " where table_name = 'applications' and column_name = 'candidate_messaging_enabled'"
    )
    assert (default["column_default"], default["is_nullable"]) == ("false", "NO")


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


async def test_019_gives_todays_staff_and_rule_changes_the_oldest_company_and_keeps_their_times(
    database: tuple[str, asyncpg.Connection, Apply],
) -> None:
    _, connection, apply = database
    await apply(BEFORE_COMPANIES)
    await connection.execute(LEGACY_ROWS)
    await apply([*COMPANIES, *MESSAGING])
    await connection.execute(
        """
        insert into public.users (email, full_name, role, updated_at)
          values ('sophia@example.com', 'Sophia Martinez', 'candidate', now() - interval '9 days');
        update public.users set updated_at = now() - interval '30 days' where role = 'recruiter';
        insert into public.communication_rules (key, enabled, threshold_hours, updated_at)
          values ('no_recent_update', false, 48, now() - interval '3 days');
        """
    )
    before = dict(await connection.fetch("select email, updated_at from public.users"))
    rule_before = await connection.fetchval("select updated_at from public.communication_rules")
    await apply(WORKSPACES)

    staff = dict(await connection.fetch("select email, company_id from public.users"))
    assert staff == {ALEX_EMAIL: ENCORD, "sophia@example.com": None}
    assert dict(await connection.fetch("select email, updated_at from public.users")) == before
    rule = await connection.fetchrow(
        "select company_id, enabled, threshold_hours, updated_at from public.communication_rules"
    )
    assert (rule["company_id"], rule["enabled"], rule["threshold_hours"]) == (ENCORD, False, 48)
    assert rule["updated_at"] == rule_before
    assert await connection.fetchval("select workspace_mode from public.companies where id = $1", ENCORD) == "full"
    # A candidate never hires for a company.
    with pytest.raises(asyncpg.CheckViolationError):
        await connection.execute("update public.users set company_id = $1 where email = 'sophia@example.com'", ENCORD)
    # Two workspaces can each change the same rule.
    other = await connection.fetchval(
        "insert into public.companies (slug, name, workspace_mode) values ('sams-cafe', 'Sam''s Cafe', 'simple') returning id"
    )
    await connection.execute(
        "insert into public.communication_rules (company_id, key, threshold_hours) values ($1, 'no_recent_update', 24)",
        other,
    )
    assert await connection.fetchval("select count(*) from public.communication_rules") == 2


async def test_020_gives_each_application_the_phone_number_it_came_with(
    database: tuple[str, asyncpg.Connection, Apply],
) -> None:
    _, connection, apply = database
    await apply(BEFORE_COMPANIES)
    await connection.execute(LEGACY_ROWS)
    await apply([*COMPANIES, *MESSAGING, *WORKSPACES])
    await connection.execute(
        f"""
        update public.candidates set phone = '+1 415 555 0134' where id = '{CANDIDATE}';
        update public.applications set updated_at = now() - interval '6 days' where id = '{APPLICATION}';
        """
    )
    before = await connection.fetchval(f"select updated_at from public.applications where id = '{APPLICATION}'")
    await apply(SIMPLE_HIRE)
    row = await connection.fetchrow(
        f"select phone, availability, updated_at from public.applications where id = '{APPLICATION}'"
    )
    assert (row["phone"], row["availability"], row["updated_at"]) == ("+1 415 555 0134", "[]", before)
    job = await connection.fetchrow(f"select pay, shift, work_days, openings from public.jobs where id = '{JOB}'")
    assert dict(job) == {"pay": None, "shift": None, "work_days": "[]", "openings": None}
