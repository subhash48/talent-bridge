"""Candidate portal analytics for recruiters: aggregates only, from the portal's own records.

Nothing here returns a candidate's id, name or email, or any individual's numbers or answers. The
recruiter assistant answers analytics questions from the same services (services/assistant).
"""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Query

from app.core.dependencies import AIProviderDep, SessionDep
from app.schemas.analytics import AnalyticsInsights, Granularity, PortalAnalytics, RangePreset
from app.schemas.demographics import DemographicsSummary
from app.schemas.portal import UTCOffset
from app.services import demographics
from app.services.analytics import insights
from app.services.analytics.periods import resolve_period
from app.services.analytics.portal import portal_stats, present

router = APIRouter(prefix="/analytics", tags=["analytics"])

RangeParam = Annotated[RangePreset, Query(alias="range")]
DateParam = Annotated[date | None, Query(description="custom ranges only: a local date, YYYY-MM-DD")]


@router.get("/portal", response_model=PortalAnalytics, summary="Candidate portal analytics")
async def portal(
    session: SessionDep,
    range_: RangeParam = "last_30_days",
    start: DateParam = None,
    end: DateParam = None,
    granularity: Granularity = "day",
    utc_offset_minutes: UTCOffset = 0,
) -> PortalAnalytics:
    """KPIs, portal engagement over time, what candidates look for and when they use the portal, for
    the chosen range in the recruiter's local days, compared with the period before it."""
    period = resolve_period(range_, utc_offset_minutes=utc_offset_minutes, start=start, end=end)
    return present(await portal_stats(session, period, granularity))


@router.get("/insights", response_model=AnalyticsInsights, summary="Insights about the candidate experience")
async def portal_insights(
    session: SessionDep,
    provider: AIProviderDep,
    range_: RangeParam = "last_30_days",
    start: DateParam = None,
    end: DateParam = None,
    utc_offset_minutes: UTCOffset = 0,
) -> AnalyticsInsights:
    """At most four, from the same aggregates as /analytics/portal. Never about a candidate, and never
    a hiring recommendation."""
    period = resolve_period(range_, utc_offset_minutes=utc_offset_minutes, start=start, end=end)
    return await insights.generate(await portal_stats(session, period), provider)


@router.get("/demographics", response_model=DemographicsSummary, summary="Voluntary demographics, in aggregate")
async def demographic_summary(session: SessionDep) -> DemographicsSummary:
    """Every voluntary answer, combined: whole percentages, with groups smaller than the minimum
    combined or hidden. Never filtered by date or anything else, so no filter can single anyone out."""
    return await demographics.aggregate(session)
