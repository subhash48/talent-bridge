"""Candidate portal analytics for recruiters (GET /analytics/*). Aggregates only: no schema here has a
field for a candidate's id, name, email or any individual's numbers. Mirrors frontend/types/analytics.ts.
"""

from typing import Literal

from app.core.enums import PortalTopic
from app.schemas.common import APIModel, Timestamp

RangePreset = Literal["today", "last_7_days", "last_30_days", "last_90_days", "this_year", "custom"]
Granularity = Literal["day", "week", "month", "year"]

ANALYTICS_NOTE = (
    "How candidates use the Candidate Portal, in aggregate. It measures the candidate experience, not candidates: "
    "it is never used to rank, score, advance or reject anyone."
)


class AnalyticsPeriod(APIModel):
    preset: RangePreset
    label: str  # "Last 30 days", "Sep 1 – Sep 30, 2026"
    start: Timestamp
    end: Timestamp  # exclusive
    previous_start: Timestamp
    previous_end: Timestamp
    utc_offset_minutes: int


class Kpi(APIModel):
    key: Literal["active_candidates", "weekly_engaged", "avg_engagement_time", "repeat_visit_rate"]
    label: str
    value: float | None  # null when there is nothing to measure
    display: str  # "1,240", "6m 24s", "38%", or "—"
    change: float | None = None  # against the comparison period; null when it can't be measured
    change_unit: Literal["percent", "points"] = "percent"
    comparison: str  # "vs previous period", "vs previous 7 days"
    description: str


class EngagementPoint(APIModel):
    start: str  # the bucket's first local day, YYYY-MM-DD
    label: str
    visits: int
    unique_candidates: int


class EngagementSeries(APIModel):
    granularity: Granularity
    points: list[EngagementPoint]
    total_visits: int


class TopicShare(APIModel):
    topic: PortalTopic
    label: str
    count: int
    share: int  # whole percent of categorized interactions


class TopicBreakdown(APIModel):
    total: int
    items: list[TopicShare]


class PeakActivity(APIModel):
    day: str  # "Tuesday"
    window: str  # "3–5 PM"
    part_of_day: str  # "afternoon"
    visits: int
    share: int  # whole percent of the period's visits


class ActivityHeatmap(APIModel):
    rows: list[str]  # Monday ... Sunday
    columns: list[str]  # "12–2 AM" ... "10 PM–12 AM"
    values: list[list[int]]  # visits started, rows x columns
    max: int
    peak: PeakActivity | None = None


class PortalAnalytics(APIModel):
    """GET /analytics/portal."""

    period: AnalyticsPeriod
    kpis: list[Kpi]
    engagement: EngagementSeries
    topics: TopicBreakdown
    heatmap: ActivityHeatmap
    generated_at: Timestamp
    note: str = ANALYTICS_NOTE


class AnalyticsInsight(APIModel):
    title: str
    detail: str


class AnalyticsInsights(APIModel):
    """GET /analytics/insights: at most four, about the candidate experience and never about a candidate."""

    period: AnalyticsPeriod
    insights: list[AnalyticsInsight]
    model_name: str
