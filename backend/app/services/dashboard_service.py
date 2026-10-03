"""Dashboard trends: the last 30 days against the 30 before."""

from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import ApplicationStage
from app.models import Application, CandidateStageHistory
from app.models.base import utcnow
from app.schemas.dashboard import DashboardSummary, DashboardTrends

PERIOD = timedelta(days=30)


async def get_summary(session: AsyncSession, now: datetime | None = None) -> DashboardSummary:
    now = now or utcnow()
    current, previous = (now - PERIOD, now), (now - 2 * PERIOD, now - PERIOD)

    async def added(window: tuple[datetime, datetime]) -> int:
        return (
            await session.scalar(
                select(func.count()).where(Application.applied_at >= window[0], Application.applied_at < window[1])
            )
            or 0
        )

    async def entered(stage: ApplicationStage, window: tuple[datetime, datetime]) -> int:
        return (
            await session.scalar(
                select(func.count()).where(
                    CandidateStageHistory.new_stage == stage,
                    CandidateStageHistory.changed_at >= window[0],
                    CandidateStageHistory.changed_at < window[1],
                )
            )
            or 0
        )

    return DashboardSummary(
        trends=DashboardTrends(
            total=_change(await added(current), await added(previous)),
            interviews=_change(
                await entered(ApplicationStage.INTERVIEW, current),
                await entered(ApplicationStage.INTERVIEW, previous),
            ),
            offers=_change(
                await entered(ApplicationStage.OFFER, current),
                await entered(ApplicationStage.OFFER, previous),
            ),
            # Follow-ups are computed live and not stored, so there is no history to compare.
            follow_up=None,
        )
    )


def _change(current: int, previous: int) -> int | None:
    if previous == 0:
        return None
    return round((current - previous) / previous * 100)
