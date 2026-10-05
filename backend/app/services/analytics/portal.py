"""Candidate portal analytics, calculated from the portal's own records on every read.

Sources, and nothing else (all first-party portal data, never Ashby):
- portal_sessions: one row per visit and application. A visit is one browser tab's client_session_id
  (renewed after half an hour away), so a visit that switched applications has several rows; its
  length is their active_seconds added up, which only grows from heartbeats the server times while
  the tab is visible and in use (services/engagement/sessions.py).
- candidate_engagement_events: page, section and feature views (repeats within minutes dropped when
  recorded) and the topics of questions asked to the portal assistant (services/analytics/topics.py).

Definitions:
- Active candidates: candidates with a visit or a portal event in the period.
- Weekly engaged: candidates with meaningful activity (a page, section or feature view, a question,
  or a visit of at least a minute of active time) in the period's last seven days.
- Average engagement time: the mean active time of the period's visits.
- Repeat visit rate: of the candidates who visited, the share who visited more than once.
- Engagement chart and heatmap: visits started per bucket, in the recruiter's local time.

None of it is per candidate in the response, and none of it feeds ranking, search order, AI
evaluation or any stage change.
"""

import uuid
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import EngagementEventType, PortalPage, PortalTopic
from app.models import CandidateEngagementEvent, PortalSession
from app.models.base import utcnow
from app.schemas.analytics import (
    ActivityHeatmap,
    EngagementPoint,
    EngagementSeries,
    Granularity,
    Kpi,
    PeakActivity,
    PortalAnalytics,
    TopicBreakdown,
    TopicShare,
)
from app.services.analytics.periods import Period
from app.services.analytics.topics import LABELS, TOPIC_EVENTS, topic_for_event

DAYS = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")
HOURS_PER_COLUMN = 2
COLUMNS = 24 // HOURS_PER_COLUMN
MEANINGFUL_SECONDS = 60
NOT_MEANINGFUL = (EngagementEventType.PORTAL_LOGIN, EngagementEventType.PORTAL_SESSION_STARTED)
STATUS_PAGES = (PortalPage.APPLICATION, PortalPage.APPLICATIONS)
WEEK = timedelta(days=7)


@dataclass(frozen=True)
class Visit:
    candidate_id: uuid.UUID
    started_at: datetime
    active_seconds: int


@dataclass(frozen=True)
class PortalStats:
    """Everything the page, the insights and the assistant read, for one period."""

    period: Period
    granularity: Granularity
    visits: list[Visit]
    previous_visits: list[Visit]
    active_candidates: int
    previous_active_candidates: int
    weekly_engaged: int
    previous_weekly_engaged: int
    topic_counts: dict[PortalTopic, int]
    status_viewers: int  # candidates who checked an application's status in the period
    status_revisitors: int  # of them, those who checked it more than once

    @property
    def avg_seconds(self) -> float | None:
        return _mean_seconds(self.visits)

    @property
    def previous_avg_seconds(self) -> float | None:
        return _mean_seconds(self.previous_visits)

    @property
    def repeat_rate(self) -> float | None:
        return _repeat_rate(self.visits)

    @property
    def previous_repeat_rate(self) -> float | None:
        return _repeat_rate(self.previous_visits)

    @property
    def visits_change(self) -> float | None:
        return percent_change(len(self.visits), len(self.previous_visits))


async def portal_stats(session: AsyncSession, period: Period, granularity: Granularity = "day") -> PortalStats:
    visits = await _visits(session, period.previous_start, period.end)
    current = [visit for visit in visits if visit.started_at >= period.start]
    previous = [visit for visit in visits if visit.started_at < period.start]

    # The last seven days of the period (up to now), whatever its length, against the seven before.
    week_end = min(period.end, period.now) if period.now > period.start else period.end
    weekly = await _meaningful_candidates(session, week_end - WEEK, week_end)
    previous_weekly = await _meaningful_candidates(session, week_end - 2 * WEEK, week_end - WEEK)

    topic_counts, status_views = await _topics(session, period.start, period.end)
    return PortalStats(
        period=period,
        granularity=granularity,
        visits=current,
        previous_visits=previous,
        active_candidates=len(await _active(session, current, period.start, period.end)),
        previous_active_candidates=len(await _active(session, previous, period.previous_start, period.previous_end)),
        weekly_engaged=len(weekly),
        previous_weekly_engaged=len(previous_weekly),
        topic_counts=topic_counts,
        status_viewers=len(status_views),
        status_revisitors=sum(1 for count in status_views.values() if count > 1),
    )


def present(stats: PortalStats) -> PortalAnalytics:
    period = stats.period
    kpis = [
        Kpi(
            key="active_candidates",
            label="Active Candidates",
            value=stats.active_candidates,
            display=f"{stats.active_candidates:,}",
            change=percent_change(stats.active_candidates, stats.previous_active_candidates),
            comparison="vs previous period",
            description="Unique candidates who used the Candidate Portal in this period.",
        ),
        Kpi(
            key="weekly_engaged",
            label="Weekly Engaged",
            value=stats.weekly_engaged,
            display=f"{stats.weekly_engaged:,}",
            change=percent_change(stats.weekly_engaged, stats.previous_weekly_engaged),
            comparison="vs previous 7 days",
            description="Unique candidates with meaningful portal activity in the last 7 days of this period.",
        ),
        Kpi(
            key="avg_engagement_time",
            label="Average Engagement Time",
            value=round(stats.avg_seconds) if stats.avg_seconds is not None else None,
            display=format_duration(stats.avg_seconds),
            change=percent_change(stats.avg_seconds, stats.previous_avg_seconds),
            comparison="vs previous period",
            description="Average active time per portal visit, timed by the server while the portal is in use.",
        ),
        Kpi(
            key="repeat_visit_rate",
            label="Repeat Visit Rate",
            value=round(stats.repeat_rate, 1) if stats.repeat_rate is not None else None,
            display=f"{round(stats.repeat_rate)}%" if stats.repeat_rate is not None else "—",
            change=(
                round(stats.repeat_rate - stats.previous_repeat_rate, 1)
                if stats.repeat_rate is not None and stats.previous_repeat_rate is not None
                else None
            ),
            change_unit="points",
            comparison="vs previous period",
            description="Share of visiting candidates who came back for more than one portal visit.",
        ),
    ]
    return PortalAnalytics(
        period=period.read(),
        kpis=kpis,
        engagement=engagement_series(stats.visits, period, stats.granularity),
        topics=topic_breakdown(stats.topic_counts),
        heatmap=heatmap(stats.visits, period),
        generated_at=utcnow(),
    )


# Pieces, each from the same records


def engagement_series(visits: list[Visit], period: Period, granularity: Granularity) -> EngagementSeries:
    totals: Counter[date] = Counter()
    people: dict[date, set[uuid.UUID]] = defaultdict(set)
    for visit in visits:
        bucket = bucket_start(period.local_day(visit.started_at), granularity)
        totals[bucket] += 1
        people[bucket].add(visit.candidate_id)
    points = [
        EngagementPoint(
            start=bucket.isoformat(),
            label=bucket_label(bucket, granularity),
            visits=totals[bucket],
            unique_candidates=len(people[bucket]),
        )
        for bucket in buckets(period.first_day, period.last_day, granularity)
    ]
    return EngagementSeries(granularity=granularity, points=points, total_visits=len(visits))


def topic_breakdown(counts: dict[PortalTopic, int]) -> TopicBreakdown:
    total = sum(counts.values())
    items = [
        TopicShare(
            topic=topic, label=LABELS[topic], count=counts.get(topic, 0), share=_share(counts.get(topic, 0), total)
        )
        for topic in PortalTopic
    ]
    items.sort(key=lambda item: (-item.count, list(PortalTopic).index(item.topic)))
    return TopicBreakdown(total=total, items=items)


def heatmap(visits: list[Visit], period: Period) -> ActivityHeatmap:
    values = [[0] * COLUMNS for _ in DAYS]
    for visit in visits:
        local = period.local(visit.started_at)
        values[local.weekday()][local.hour // HOURS_PER_COLUMN] += 1
    peak_value, row, column = max(
        ((values[r][c], -r, -c) for r in range(len(DAYS)) for c in range(COLUMNS)), default=(0, 0, 0)
    )
    peak = None
    if peak_value:
        start_hour = -column * HOURS_PER_COLUMN
        peak = PeakActivity(
            day=DAYS[-row],
            window=hour_window(start_hour),
            part_of_day=part_of_day(start_hour),
            visits=peak_value,
            share=_share(peak_value, len(visits)),
        )
    return ActivityHeatmap(
        rows=list(DAYS),
        columns=[hour_window(column * HOURS_PER_COLUMN) for column in range(COLUMNS)],
        values=values,
        max=max((max(row) for row in values), default=0),
        peak=peak,
    )


# Queries


async def _visits(session: AsyncSession, start: datetime, end: datetime) -> list[Visit]:
    rows = await session.execute(
        select(
            PortalSession.candidate_id,
            func.min(PortalSession.started_at),
            func.sum(PortalSession.active_seconds),
        )
        .where(PortalSession.started_at >= start, PortalSession.started_at < end)
        .group_by(PortalSession.candidate_id, PortalSession.client_session_id)
    )
    return [
        Visit(candidate_id=candidate_id, started_at=_aware(started_at), active_seconds=int(seconds or 0))
        for candidate_id, started_at, seconds in rows.all()
    ]


async def _active(session: AsyncSession, visits: list[Visit], start: datetime, end: datetime) -> set[uuid.UUID]:
    candidates = {visit.candidate_id for visit in visits}
    candidates.update(
        await session.scalars(
            select(CandidateEngagementEvent.candidate_id)
            .where(CandidateEngagementEvent.occurred_at >= start, CandidateEngagementEvent.occurred_at < end)
            .distinct()
        )
    )
    return candidates


async def _meaningful_candidates(session: AsyncSession, start: datetime, end: datetime) -> set[uuid.UUID]:
    candidates = set(
        await session.scalars(
            select(CandidateEngagementEvent.candidate_id)
            .where(
                CandidateEngagementEvent.occurred_at >= start,
                CandidateEngagementEvent.occurred_at < end,
                CandidateEngagementEvent.event_type.not_in([event.value for event in NOT_MEANINGFUL]),
            )
            .distinct()
        )
    )
    candidates.update(
        await session.scalars(
            select(PortalSession.candidate_id)
            .where(PortalSession.started_at >= start, PortalSession.started_at < end)
            .group_by(PortalSession.candidate_id, PortalSession.client_session_id)
            .having(func.sum(PortalSession.active_seconds) >= MEANINGFUL_SECONDS)
        )
    )
    return candidates


async def _topics(
    session: AsyncSession, start: datetime, end: datetime
) -> tuple[dict[PortalTopic, int], Counter[uuid.UUID]]:
    rows = await session.execute(
        select(
            CandidateEngagementEvent.candidate_id, CandidateEngagementEvent.event_type, CandidateEngagementEvent.meta
        ).where(
            CandidateEngagementEvent.occurred_at >= start,
            CandidateEngagementEvent.occurred_at < end,
            CandidateEngagementEvent.event_type.in_([str(event) for event in TOPIC_EVENTS]),
        )
    )
    counts: Counter[PortalTopic] = Counter()
    status_views: Counter[uuid.UUID] = Counter()
    for candidate_id, event_type, meta in rows.all():
        topic = topic_for_event(event_type, meta)
        if topic is not None:
            counts[topic] += 1
        if _is_status_view(event_type, meta):
            status_views[candidate_id] += 1
    return dict(counts), status_views


def _is_status_view(event_type: str, meta: dict[str, Any] | None) -> bool:
    if event_type == EngagementEventType.APPLICATION_VIEWED:
        return True
    return event_type == EngagementEventType.PAGE_VIEW and (meta or {}).get("target") in STATUS_PAGES


# Helpers


def percent_change(current: float | None, previous: float | None) -> float | None:
    """Relative change in percent, or None when there's nothing to compare with."""
    if current is None or not previous:
        return None
    return round(100 * (current - previous) / previous, 1)


def format_duration(seconds: float | None) -> str:
    if seconds is None:
        return "—"
    total = round(seconds)
    minutes, rest = divmod(total, 60)
    if minutes >= 60:
        hours, minutes = divmod(minutes, 60)
        return f"{hours}h {minutes}m"
    return f"{minutes}m {rest:02d}s" if minutes else f"{rest}s"


def bucket_start(day: date, granularity: Granularity) -> date:
    if granularity == "week":
        return day - timedelta(days=day.weekday())
    if granularity == "month":
        return day.replace(day=1)
    if granularity == "year":
        return day.replace(month=1, day=1)
    return day


def buckets(first: date, last: date, granularity: Granularity) -> list[date]:
    result: list[date] = []
    current = bucket_start(first, granularity)
    while current <= last:
        result.append(current)
        if granularity == "day":
            current += timedelta(days=1)
        elif granularity == "week":
            current += WEEK
        elif granularity == "month":
            current = date(current.year + current.month // 12, current.month % 12 + 1, 1)
        else:
            current = date(current.year + 1, 1, 1)
    return result


def bucket_label(day: date, granularity: Granularity) -> str:
    if granularity == "month":
        return f"{day:%b %Y}"
    if granularity == "year":
        return str(day.year)
    return f"{day:%b} {day.day}"


def hour_window(start_hour: int) -> str:
    """A column's hours: "3–5 PM", "10 AM–12 PM", "12–2 AM", "10 PM–12 AM"."""
    end_hour = start_hour + HOURS_PER_COLUMN

    def clock(hour: int) -> int:
        return hour % 12 or 12

    def half(hour: int) -> str:
        return "AM" if hour % 24 < 12 else "PM"

    if half(start_hour) == half(end_hour):
        return f"{clock(start_hour)}–{clock(end_hour)} {half(end_hour)}"
    return f"{clock(start_hour)} {half(start_hour)}–{clock(end_hour)} {half(end_hour)}"


def part_of_day(hour: int) -> str:
    if 5 <= hour < 12:
        return "morning"
    if 12 <= hour < 17:
        return "afternoon"
    if 17 <= hour < 21:
        return "evening"
    return "night"


def _share(part: int, whole: int) -> int:
    return round(100 * part / whole) if whole else 0


def _mean_seconds(visits: list[Visit]) -> float | None:
    return sum(visit.active_seconds for visit in visits) / len(visits) if visits else None


def _repeat_rate(visits: list[Visit]) -> float | None:
    per_candidate = Counter(visit.candidate_id for visit in visits)
    if not per_candidate:
        return None
    return 100 * sum(1 for count in per_candidate.values() if count > 1) / len(per_candidate)


def _aware(moment: datetime) -> datetime:
    return moment.replace(tzinfo=UTC) if moment.tzinfo is None else moment
