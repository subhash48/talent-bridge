"""Adding newer demo data to a database seeded before it: only what's missing goes in."""

import uuid

import pytest
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.db import seed
from app.db.seed import add_missing, build_seed, seed_id
from app.db.seed_data import LATER_CANDIDATES, SAMS_APPLICANTS
from app.models import Application, Candidate, CandidateActivity, CandidateStageHistory, Interview, Message
from tests.conftest import application_id, candidate_id

GOOGLE = uuid.UUID(application_id("sophia-martinez@google"))
SOPHIA = uuid.UUID(candidate_id("sophia-martinez"))


async def test_add_missing_inserts_only_rows_the_database_lacks(sessions: async_sessionmaker[AsyncSession]) -> None:
    async with sessions() as session:
        # A database from before Sophia's Google application was in the demo data...
        for table in (CandidateActivity, Message, Interview, CandidateStageHistory):
            await session.execute(delete(table).where(table.application_id == GOOGLE))
        await session.execute(delete(Application).where(Application.id == GOOGLE))
        # ...where someone has since changed a demo record.
        await session.execute(update(Candidate).where(Candidate.id == SOPHIA).values(location="Bristol, UK"))
        await session.commit()

        added = await add_missing(session)
        assert set(added) == {"applications", "candidate_stage_history", "interviews", "messages", "candidate_activity"}
        assert (added["applications"], added["interviews"], added["messages"]) == (1, 1, 3)
        assert await session.scalar(select(Application.id).where(Application.id == GOOGLE)) == GOOGLE
        # Nothing already there was touched, and a second run adds nothing.
        assert await session.scalar(select(Candidate.location).where(Candidate.id == SOPHIA)) == "Bristol, UK"
        assert await add_missing(session) == {}


def test_later_demo_candidates_never_change_the_ids_of_rows_seeded_before(monkeypatch: pytest.MonkeyPatch) -> None:
    """Timeline and stage-history ids follow each table's row order, so candidates added to the demo data
    later go after everything a database may already have: none of its rows gets a new id (and a second copy
    from seed --add-missing)."""
    current = build_seed()
    monkeypatch.setattr(seed, "LATER_CANDIDATES", ())
    monkeypatch.setattr(seed, "SAMS_APPLICANTS", ())
    before = build_seed()
    later = {seed_id("application", candidate.key) for candidate in (*LATER_CANDIDATES, *SAMS_APPLICANTS)}
    for table in (CandidateActivity, CandidateStageHistory, Message, Interview):
        kept = {row["id"] for row in before[table]}
        assert kept == {row["id"] for row in current[table] if row["application_id"] not in later}, table.__tablename__


def test_sams_cafe_comes_after_everything_seeded_before(monkeypatch: pytest.MonkeyPatch) -> None:
    """Sam's Cafe's applicants were added to the demo data last: a database seeded before keeps every id."""
    current = build_seed()
    monkeypatch.setattr(seed, "SAMS_APPLICANTS", ())
    before = build_seed()
    sams = {seed_id("application", candidate.key) for candidate in SAMS_APPLICANTS}
    for table in (CandidateActivity, CandidateStageHistory, Message, Interview):
        kept = {row["id"] for row in before[table]}
        assert kept == {row["id"] for row in current[table] if row["application_id"] not in sams}, table.__tablename__
