"""Adding newer demo data to a database seeded before it: only what's missing goes in."""

import uuid

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.db.seed import add_missing
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
