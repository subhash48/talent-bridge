"""Async SQLAlchemy engine, the session dependency and startup initialisation.

Production runs on Supabase Postgres through DATABASE_URL, and supabase/migrations owns that
schema. Local development and the tests run on SQLite, where the tables come from the models.
The engine is created on first use, never at import time, so the app boots without a database.
"""

import logging
from collections.abc import AsyncIterator
from typing import Any
from uuid import uuid4

from sqlalchemy import event, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool, StaticPool

from app.core.config import SQLITE_DEV_URL, settings

logger = logging.getLogger(__name__)

_engine: AsyncEngine | None = None
_sessionmaker: async_sessionmaker[AsyncSession] | None = None

LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}


def create_engine_for(url: str, *, echo: bool = False) -> AsyncEngine:
    parsed = make_url(url)
    options: dict[str, Any] = {"echo": echo}

    if parsed.get_backend_name() == "sqlite":
        if parsed.database in (None, "", ":memory:"):
            # One shared connection, or every session would see its own empty database.
            options["poolclass"] = StaticPool
        engine = create_async_engine(url, **options)
        event.listen(engine.sync_engine, "connect", _enable_sqlite_foreign_keys)
        return engine

    # Supabase's pooler (Supavisor, transaction mode) can't keep prepared statements between
    # transactions. Unique statement names and no statement cache work with the pooler and with
    # direct connections alike.
    options["connect_args"] = {
        "statement_cache_size": 0,
        "prepared_statement_name_func": lambda: f"__asyncpg_{uuid4()}__",
    }
    if parsed.port == 6543 or "pooler.supabase.com" in (parsed.host or ""):
        options["poolclass"] = NullPool  # the pooler already pools
    else:
        options["pool_pre_ping"] = True
    return create_async_engine(url, **options)


def _enable_sqlite_foreign_keys(dbapi_connection: Any, _record: Any) -> None:
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


def get_engine() -> AsyncEngine:
    global _engine
    if _engine is None:
        _engine = create_engine_for(settings.database_url, echo=settings.database_echo)
    return _engine


def get_sessionmaker() -> async_sessionmaker[AsyncSession]:
    global _sessionmaker
    if _sessionmaker is None:
        _sessionmaker = async_sessionmaker(get_engine(), expire_on_commit=False)
    return _sessionmaker


async def use_database(url: str) -> None:
    """Point the app at another database (the SQLite fallback, or a test database)."""
    global _engine, _sessionmaker
    await dispose_engine()
    _engine = create_engine_for(url, echo=settings.database_echo)
    _sessionmaker = async_sessionmaker(_engine, expire_on_commit=False)


async def dispose_engine() -> None:
    global _engine, _sessionmaker
    if _engine is not None:
        await _engine.dispose()
    _engine = None
    _sessionmaker = None


async def get_session() -> AsyncIterator[AsyncSession]:
    async with get_sessionmaker()() as session:
        yield session


async def create_tables(engine: AsyncEngine) -> None:
    from app.models import Base

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)


async def init_database() -> None:
    """Prepare the database on startup. Never raises, so /health stays up and errors are logged."""
    engine = get_engine()
    try:
        async with engine.connect() as connection:
            await connection.execute(text("select 1"))
    except (OSError, SQLAlchemyError) as exc:
        location = engine.url.render_as_string(hide_password=True)
        if not _may_fall_back_to_sqlite(engine):
            logger.error("Can't reach the database at %s: %s", location, exc)
            return
        logger.warning(
            "No Postgres running at %s, so the API is using local SQLite (%s) for development. "
            "Set DATABASE_URL to your Supabase connection string to use Postgres.",
            location,
            SQLITE_DEV_URL,
        )
        await use_database(SQLITE_DEV_URL)
        engine = get_engine()

    if engine.dialect.name == "sqlite":
        await create_tables(engine)

    if not settings.seed_demo_data:
        return
    from app.db.seed import seed_if_empty

    try:
        async with get_sessionmaker()() as session:
            if await seed_if_empty(session):
                logger.info("Loaded the demo pipeline into the empty database.")
    except SQLAlchemyError as exc:
        logger.error("Couldn't load the demo data: %s. On Supabase, apply supabase/migrations first.", exc)


def _may_fall_back_to_sqlite(engine: AsyncEngine) -> bool:
    """Only a local Postgres in development falls back; a configured Supabase URL never does."""
    return (
        settings.environment == "development"
        and engine.url.get_backend_name() == "postgresql"
        and engine.url.host in LOCAL_HOSTS
    )
