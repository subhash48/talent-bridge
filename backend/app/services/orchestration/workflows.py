"""Time-based workflows: the scheduler sweep (ARCHITECTURE.md 5.5).

"No reply in three days" can't be triggered by an event, so the sweep re-evaluates every active
application. Invoked by POST /v1/internal/sweep.
"""

from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession


async def run_sweep(session: AsyncSession, now: datetime) -> int:
    """Re-evaluate all active applications and return how many insights changed."""
    raise NotImplementedError  # TODO: snapshot, engagement + next action, upsert, change_feed
