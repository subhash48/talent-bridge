"""Candidate portal analytics: what the portal records, how the numbers are calculated from it, who can
see them, and the insights written from them."""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.enums import PortalTopic
from app.models import CandidateEngagementEvent, PortalSession
from app.schemas.analytics import AnalyticsInsight
from app.services.ai.client import AIProviderError
from app.services.ai.fallback import MockProvider
from app.services.analytics import insights
from app.services.analytics.periods import resolve_period
from app.services.analytics.portal import PortalStats, bucket_label, buckets, hour_window, portal_stats, present
from app.services.analytics.topics import topic_for_event, topic_for_question
from tests.conftest import API, application_id, candidate_id

SOPHIA_APP = application_id("sophia-martinez")
# A fixed "now" years after the seeded demo activity, so only what each test records is in range.
NOW = datetime(2031, 3, 12, 18, 0, tzinfo=UTC)  # a Wednesday
PEOPLE = ("sophia-martinez", "james-park", "priya-desai", "daniel-lee")


async def visit(
    sessions: async_sessionmaker[AsyncSession],
    person: str,
    started: datetime,
    seconds: int,
    *,
    applications: int = 1,
) -> uuid.UUID:
    """One portal visit; with applications=2 it switched applications part-way (two rows, one visit)."""
    visit_id = uuid.uuid4()
    async with sessions() as session:
        for index in range(applications):
            session.add(
                PortalSession(
                    candidate_id=uuid.UUID(candidate_id(person)),
                    application_id=uuid.UUID(application_id(person))
                    if index == 0
                    else await _other_application(session, person),
                    client_session_id=visit_id,
                    started_at=started + timedelta(minutes=index),
                    last_active_at=started + timedelta(seconds=seconds),
                    active_seconds=seconds // applications,
                )
            )
        await session.commit()
    return visit_id


async def _other_application(session: AsyncSession, person: str) -> uuid.UUID:
    from app.models import Application, Job

    job = await session.scalar(select(Job.id).where(Job.title == "ML Engineer"))
    application = Application(candidate_id=uuid.UUID(candidate_id(person)), job_id=job, stage="screening")
    session.add(application)
    await session.flush()
    return application.id


async def event(
    sessions: async_sessionmaker[AsyncSession], person: str, event_type: str, at: datetime, **meta: Any
) -> None:
    async with sessions() as session:
        session.add(
            CandidateEngagementEvent(
                candidate_id=uuid.UUID(candidate_id(person)),
                application_id=uuid.UUID(application_id(person)),
                event_type=event_type,
                occurred_at=at,
                meta=meta or None,
            )
        )
        await session.commit()


async def stats_for(sessions: async_sessionmaker[AsyncSession], preset: Any = "last_7_days") -> PortalStats:
    async with sessions() as session:
        return await portal_stats(session, resolve_period(preset, now=NOW))


# What the portal records


async def test_section_views_are_recorded_once_however_often_they_are_sent(
    client: AsyncClient, sessions: async_sessionmaker[AsyncSession]
) -> None:
    """A rerender that sends the same view twice, or a reload, records it once."""
    visit_id = str(uuid.uuid4())
    await client.post(
        f"{API}/candidate/engagement/sessions", json={"session_id": visit_id, "application_id": SOPHIA_APP}
    )
    view = {
        "type": "company_section_viewed",
        "application_id": SOPHIA_APP,
        "session_id": visit_id,
        "section": "benefits",
    }
    page = {"type": "page_view", "application_id": SOPHIA_APP, "session_id": visit_id, "page": "company"}
    for _ in range(2):
        response = await client.post(f"{API}/candidate/engagement/events", json={"events": [view, view, page, page]})
        assert response.status_code == 204
    async with sessions() as session:
        rows = (
            await session.execute(
                select(CandidateEngagementEvent.event_type, CandidateEngagementEvent.meta).where(
                    CandidateEngagementEvent.event_type.in_(["company_section_viewed", "page_view"])
                )
            )
        ).all()
    assert sorted((event_type, meta["target"]) for event_type, meta in rows) == [
        ("company_section_viewed", "benefits"),
        ("page_view", "company"),
    ]
    # A section view without a section, or with one the page doesn't have, records nothing.
    missing = {"type": "company_section_viewed", "application_id": SOPHIA_APP}
    assert (await client.post(f"{API}/candidate/engagement/events", json={"events": [missing]})).status_code == 204
    wrong = {**view, "section": "salaries"}
    assert (await client.post(f"{API}/candidate/engagement/events", json={"events": [wrong]})).status_code == 422
    # The portal can't claim a question was asked: the server records that itself.
    asked = {"type": "ai_question_asked", "application_id": SOPHIA_APP}
    assert (await client.post(f"{API}/candidate/engagement/events", json={"events": [asked]})).status_code == 422


async def test_a_question_to_the_assistant_is_kept_as_its_topic_only(
    client: AsyncClient, sessions: async_sessionmaker[AsyncSession]
) -> None:
    question = "What is the salary range for this role, roughly?"
    assert (await client.post(f"{API}/candidate/ai/ask", json={"message": question})).status_code == 200
    async with sessions() as session:
        rows = (
            await session.scalars(
                select(CandidateEngagementEvent).where(CandidateEngagementEvent.event_type == "ai_question_asked")
            )
        ).all()
    assert [row.meta for row in rows] == [{"topic": "compensation"}]
    assert "salary" not in str(rows[0].meta)


def test_questions_and_events_map_to_topics() -> None:
    assert topic_for_question("How should I prepare for the design interview?") == PortalTopic.INTERVIEW_PREPARATION
    assert topic_for_question("Is there equity or a bonus?") == PortalTopic.COMPENSATION
    assert topic_for_question("How much paid time off do you offer?") == PortalTopic.BENEFITS
    assert topic_for_question("What's the team culture like?") == PortalTopic.CULTURE_TEAM
    assert topic_for_question("Where does my application stand?") == PortalTopic.APPLICATION_STATUS
    assert topic_for_question("What products does Encord make?") == PortalTopic.COMPANY_INFORMATION
    assert topic_for_event("page_view", {"target": "prep"}) == PortalTopic.INTERVIEW_PREPARATION
    assert topic_for_event("page_view", {"target": "dashboard"}) is None  # where every visit lands: no topic
    assert topic_for_event("company_section_viewed", {"target": "benefits"}) == PortalTopic.BENEFITS
    assert topic_for_event("ai_question_asked", {"topic": "culture_team"}) == PortalTopic.CULTURE_TEAM
    assert topic_for_event("ai_question_asked", {"topic": "something else"}) is None
    assert topic_for_event("portal_login", None) is None


# How the numbers are calculated


async def test_visits_durations_and_repeat_visits(sessions: async_sessionmaker[AsyncSession]) -> None:
    day = timedelta(days=1)
    await visit(sessions, "sophia-martinez", NOW - 1 * day, 300, applications=2)  # one visit across two applications
    await visit(sessions, "sophia-martinez", NOW - 2 * day, 120)
    await visit(sessions, "james-park", NOW - 3 * day, 60)
    await visit(sessions, "priya-desai", NOW - 20 * day, 999)  # outside the last 7 days
    await event(sessions, "daniel-lee", "page_view", NOW - 2 * day, target="company")  # no visit, still active

    stats = await stats_for(sessions)
    assert len(stats.visits) == 3  # the two-application visit is one
    assert stats.active_candidates == 3  # Sophia, James and Daniel
    assert stats.avg_seconds == pytest.approx((300 + 120 + 60) / 3)
    assert stats.repeat_rate == pytest.approx(50)  # Sophia came back; James didn't
    view = present(stats)
    kpis = {kpi.key: kpi for kpi in view.kpis}
    assert kpis["avg_engagement_time"].display == "2m 40s"
    assert kpis["repeat_visit_rate"].display == "50%"
    assert kpis["active_candidates"].display == "3"

    # The 30 days before NOW include Priya's visit; the period before the last 7 days held only hers.
    month = await stats_for(sessions, "last_30_days")
    assert month.active_candidates == 4
    week = await stats_for(sessions)
    assert week.previous_active_candidates == 0  # nothing 8-14 days ago
    assert present(week).kpis[0].change is None  # nothing to compare with


async def test_weekly_engaged_counts_meaningful_activity_only(sessions: async_sessionmaker[AsyncSession]) -> None:
    await visit(sessions, "sophia-martinez", NOW - timedelta(days=1), 120)  # a real visit
    await visit(sessions, "james-park", NOW - timedelta(days=2), 10)  # opened and left
    await event(sessions, "james-park", "portal_login", NOW - timedelta(days=2))  # signing in alone isn't engagement
    await event(sessions, "priya-desai", "prep_viewed", NOW - timedelta(days=3))
    await event(sessions, "daniel-lee", "prep_viewed", NOW - timedelta(days=9))  # the week before
    stats = await stats_for(sessions, "last_30_days")
    assert stats.weekly_engaged == 2
    assert stats.previous_weekly_engaged == 1


async def test_topics_count_the_period_only(sessions: async_sessionmaker[AsyncSession]) -> None:
    at = NOW - timedelta(days=1)
    for _ in range(3):
        await event(sessions, "sophia-martinez", "page_view", at, target="prep")
    await event(sessions, "james-park", "ai_question_asked", at, topic="compensation")
    await event(sessions, "james-park", "company_section_viewed", at, target="benefits")
    await event(sessions, "priya-desai", "page_view", at, target="dashboard")  # no topic
    await event(sessions, "priya-desai", "page_view", NOW - timedelta(days=40), target="company")  # out of range
    view = present(await stats_for(sessions))
    topics = {item.topic: (item.count, item.share) for item in view.topics.items}
    assert view.topics.total == 5
    assert topics[PortalTopic.INTERVIEW_PREPARATION] == (3, 60)
    assert topics[PortalTopic.COMPENSATION] == (1, 20)
    assert topics[PortalTopic.BENEFITS] == (1, 20)
    assert topics[PortalTopic.COMPANY_INFORMATION] == (0, 0)
    assert view.topics.items[0].topic == PortalTopic.INTERVIEW_PREPARATION


async def test_engagement_buckets_by_day_week_month_and_year(sessions: async_sessionmaker[AsyncSession]) -> None:
    for days_ago, person in ((0, "sophia-martinez"), (0, "james-park"), (0, "james-park"), (8, "priya-desai")):
        await visit(sessions, person, NOW - timedelta(days=days_ago, hours=1), 60)
    async with sessions() as session:
        period = resolve_period("last_30_days", now=NOW)
        daily = present(await portal_stats(session, period, "day")).engagement
        weekly = present(await portal_stats(session, period, "week")).engagement
        yearly = present(await portal_stats(session, resolve_period("this_year", now=NOW), "year")).engagement
        monthly = present(await portal_stats(session, resolve_period("this_year", now=NOW), "month")).engagement
    assert len(daily.points) == 30
    assert (daily.points[-1].visits, daily.points[-1].unique_candidates) == (3, 2)
    assert daily.total_visits == 4
    assert [point.start for point in weekly.points][-2:] == ["2031-03-03", "2031-03-10"]  # weeks start on Monday
    assert weekly.points[-1].visits == 3 and weekly.points[-2].visits == 1
    assert [point.label for point in monthly.points] == ["Jan 2031", "Feb 2031", "Mar 2031"]
    assert [point.visits for point in monthly.points] == [0, 0, 4]
    assert [(point.label, point.visits) for point in yearly.points] == [("2031", 4)]


def test_bucket_helpers() -> None:
    from datetime import date

    assert buckets(date(2031, 11, 20), date(2032, 2, 3), "month") == [
        date(2031, 11, 1),
        date(2031, 12, 1),
        date(2032, 1, 1),
        date(2032, 2, 1),
    ]
    assert bucket_label(date(2031, 3, 9), "day") == "Mar 9"
    assert [hour_window(hour) for hour in (0, 10, 12, 14, 22)] == [
        "12–2 AM",
        "10 AM–12 PM",
        "12–2 PM",
        "2–4 PM",
        "10 PM–12 AM",
    ]


async def test_the_heatmap_and_peak_use_the_recruiters_local_time(sessions: async_sessionmaker[AsyncSession]) -> None:
    # Tuesday 22:30 UTC is Tuesday 3:30 PM in San Francisco (UTC-7).
    tuesday = datetime(2031, 3, 11, 22, 30, tzinfo=UTC)
    for person in PEOPLE[:3]:
        await visit(sessions, person, tuesday, 60)
    await visit(sessions, "daniel-lee", datetime(2031, 3, 10, 9, 0, tzinfo=UTC), 60)
    async with sessions() as session:
        local = present(await portal_stats(session, resolve_period("last_7_days", now=NOW, utc_offset_minutes=-420)))
        utc = present(await portal_stats(session, resolve_period("last_7_days", now=NOW)))
    peak = local.heatmap.peak
    assert peak is not None
    assert (peak.day, peak.window, peak.part_of_day, peak.visits, peak.share) == (
        "Tuesday",
        "2–4 PM",
        "afternoon",
        3,
        75,
    )
    assert local.heatmap.values[1][7] == 3  # Tuesday, the 2–4 PM column
    assert utc.heatmap.peak is not None and utc.heatmap.peak.window == "10 PM–12 AM"


async def test_custom_ranges_are_whole_local_days(sessions: async_sessionmaker[AsyncSession]) -> None:
    from datetime import date

    await visit(sessions, "sophia-martinez", datetime(2031, 3, 1, 12, tzinfo=UTC), 60)
    await visit(sessions, "james-park", datetime(2031, 3, 5, 12, tzinfo=UTC), 60)
    async with sessions() as session:
        period = resolve_period("custom", start=date(2031, 3, 1), end=date(2031, 3, 1), now=NOW)
        stats = await portal_stats(session, period)
    assert len(stats.visits) == 1
    assert period.label == "Mar 1, 2031"


# Insights


async def test_insights_come_from_the_numbers_and_stay_about_the_experience(
    sessions: async_sessionmaker[AsyncSession],
) -> None:
    for days_ago in (1, 2, 3):
        for person in PEOPLE[:3]:
            await visit(sessions, person, NOW - timedelta(days=days_ago, hours=2), 240)
            await event(sessions, person, "application_viewed", NOW - timedelta(days=days_ago, hours=2))
    await visit(sessions, "daniel-lee", NOW - timedelta(days=9), 100)
    for _ in range(4):
        await event(sessions, "sophia-martinez", "page_view", NOW - timedelta(days=1), target="prep")

    stats = await stats_for(sessions)
    result = await insights.generate(stats, MockProvider())
    assert result.model_name == insights.RULES
    titles = [item.title for item in result.insights]
    assert 1 <= len(titles) <= insights.MAX_INSIGHTS
    assert titles[0] == "Engagement is up 200%"  # 3 active candidates against 1
    assert "Application status receives repeated visits" in titles
    assert insights.acceptable(result.insights, insights.facts_from(stats))


async def test_a_models_insights_are_used_only_when_they_pass_the_checks(
    sessions: async_sessionmaker[AsyncSession],
) -> None:
    await visit(sessions, "sophia-martinez", NOW - timedelta(days=1), 240)
    await event(sessions, "sophia-martinez", "page_view", NOW - timedelta(days=1), target="prep")
    stats = await stats_for(sessions)

    class Model(MockProvider):
        name, model = "fake", "fake-model"

        def __init__(self, answer: list[AnalyticsInsight] | None) -> None:
            self.answer = answer

        async def portal_insights(self, facts: Any) -> list[AnalyticsInsight]:
            if self.answer is None:
                raise AIProviderError("down")
            return self.answer

    good = [
        AnalyticsInsight(title="Interview preparation leads", detail="100% of categorized interactions were about it.")
    ]
    assert (await insights.generate(stats, Model(good))).model_name == "fake-model"
    invented = [AnalyticsInsight(title="Engagement is up 42%", detail="A big jump.")]
    hiring = [AnalyticsInsight(title="Prioritize engaged candidates", detail="Advance them first.")]
    sensitive = [AnalyticsInsight(title="Demographics", detail="Most visitors are of one ethnicity.")]
    for answer in (invented, hiring, sensitive, None, []):
        assert (await insights.generate(stats, Model(answer))).model_name == insights.RULES
