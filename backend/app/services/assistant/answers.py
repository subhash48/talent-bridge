"""The assistant's read-only answers: analytics, jobs, candidate lists and interviews.

Each comes from the same service the workspace page uses (analytics from services/analytics and
services/demographics, candidate lists from candidate_service.list_pipeline in its usual order,
jobs from the jobs table), so an answer always matches what the recruiter would see there.
"""

import uuid
from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import InterviewStatus, JobStatus
from app.models import Application, Interview, Job
from app.models.base import utcnow
from app.schemas.ai import AISource
from app.schemas.analytics import RangePreset
from app.schemas.assistant import (
    AnalyticsCard,
    AnalyticsRow,
    AssistantIntent,
    CandidateBrief,
    CandidateListCard,
    InterviewCardItem,
    InterviewInfoCard,
    JobListCard,
    JobListItem,
)
from app.services import candidate_service, demographics
from app.services.analytics.periods import resolve_period
from app.services.analytics.portal import portal_stats, present
from app.services.assistant.resolve import find_jobs

PERIOD_PRESETS: dict[str, RangePreset] = {
    "today": "today",
    "this_week": "last_7_days",
    "last_7_days": "last_7_days",
    "this_month": "last_30_days",
    "last_month": "last_30_days",
    "last_30_days": "last_30_days",
    "last_90_days": "last_90_days",
    "this_year": "this_year",
}
PERIOD_PHRASES: dict[str, str] = {
    "today": "today",
    "last_7_days": "in the last 7 days",
    "last_30_days": "in the last 30 days",
    "last_90_days": "in the last 90 days",
    "this_year": "this year",
}
HELP = (
    "Here's what I can do:\n"
    '- **Messages:** "Send Sophia an interview invitation for next Tuesday". You confirm before anything is sent.\n'
    '- **Jobs:** "Create an entry-level Recruiting Engineer job in San Francisco", then "make it hybrid" or '
    '"publish the job".\n'
    '- **Candidates:** "Show candidates interviewing for Product Designer" or "Tell me about Sophia\'s application".\n'
    '- **Analytics:** "What were candidates looking for this week?"'
)


def brief(application: Application) -> CandidateBrief:
    return CandidateBrief(
        application_id=application.id,
        candidate_id=application.candidate_id,
        name=application.candidate.full_name,
        job_title=application.job.title,
        stage=application.stage,
    )


def analytics_source(preset: str, label: str) -> AISource:
    return AISource(type="analytics", id=preset, label=f"Candidate Portal Analytics · {label}")


# Analytics


async def analytics(
    session: AsyncSession, intent: AssistantIntent, utc_offset_minutes: int
) -> tuple[str, AnalyticsCard, list[AISource]]:
    metric = intent.metric or "overview"
    default: RangePreset = "last_7_days" if metric in ("weekly_engaged",) else "last_30_days"
    preset = PERIOD_PRESETS.get(intent.period or "", default)
    if metric in ("regions", "demographics"):
        return await _demographics(session, intent)

    period = resolve_period(preset, utc_offset_minutes=utc_offset_minutes)
    stats = await portal_stats(session, period)
    view = present(stats)
    when = PERIOD_PHRASES.get(preset, f"in {period.label}")
    kpis = {kpi.key: kpi for kpi in view.kpis}
    href = f"/recruiter/analytics?range={preset}"
    sources = [analytics_source(preset, period.label)]

    if not stats.visits and not stats.active_candidates:
        reply = f"There's no Candidate Portal activity {when} yet."
        return reply, AnalyticsCard(title="Candidate Portal", period=period.label, rows=[], href=href), sources

    if metric == "top_topics":
        items = [item for item in view.topics.items if item.count]
        if not items:
            reply = f"Candidates haven't looked at any particular topic {when} yet."
        else:
            top, rest = items[0], items[1:3]
            reply = (
                f"{when.capitalize()}, candidates were most interested in **{top.label}**: {top.share}% of "
                f"categorized portal interactions ({top.count:,})."
            )
            if rest:
                reply += " Next: " + " and ".join(f"{item.label} ({item.share}%)" for item in rest) + "."
        rows = [AnalyticsRow(label=item.label, value=f"{item.share}% · {item.count:,}") for item in view.topics.items]
        card = AnalyticsCard(title="What candidates are looking for", period=period.label, rows=rows, href=href)
        return reply, card, sources

    if metric == "peak_activity":
        peak = view.heatmap.peak
        reply = (
            f"Candidates are most active on **{peak.day}s, {peak.window}** (your time): {peak.share}% of portal visits "
            f"{when} started then."
            if peak
            else f"There aren't enough portal visits {when} to show a peak."
        )
        rows = [AnalyticsRow(label="Peak window", value=f"{peak.day} · {peak.window}")] if peak else []
        if peak:
            rows.append(AnalyticsRow(label="Share of visits", value=f"{peak.share}%"))
        return (
            reply,
            AnalyticsCard(title="When candidates use the portal", period=period.label, rows=rows, href=href),
            sources,
        )

    if metric == "engagement_change":
        change = stats.visits_change
        visits, before = len(stats.visits), len(stats.previous_visits)
        if change is None:
            reply = f"There were {visits:,} portal visits {when}, and none in the period before, so there's no change to compare."
        else:
            direction = "up" if change > 0 else "down" if change < 0 else "flat"
            amount = f" {abs(round(change))}%" if direction != "flat" else ""
            reply = (
                f"Portal visits are **{direction}{amount}** {when} compared with the period before "
                f"({visits:,} vs {before:,})."
            )
        active = kpis["active_candidates"]
        reply += f" Active candidates: {active.display}{_change(active.change, 'percent')}."
        rows = [
            AnalyticsRow(label="Portal visits", value=f"{visits:,}{_change(change, 'percent')}"),
            AnalyticsRow(label="Active candidates", value=f"{active.display}{_change(active.change, 'percent')}"),
        ]
        return reply, AnalyticsCard(title="Engagement change", period=period.label, rows=rows, href=href), sources

    sentences = {
        "active_candidates": f"**{kpis['active_candidates'].display} candidates** used the Candidate Portal {when}",
        "weekly_engaged": f"**{kpis['weekly_engaged'].display} candidates** had meaningful portal activity in the last 7 days",
        "avg_engagement_time": f"Portal visits lasted **{kpis['avg_engagement_time'].display}** on average {when}",
        "repeat_visit_rate": f"**{kpis['repeat_visit_rate'].display}** of visiting candidates came back more than once {when}",
    }
    if metric in sentences:
        kpi = kpis[metric]
        reply = f"{sentences[metric]}{_change(kpi.change, kpi.change_unit, kpi.comparison)}."
    else:
        reply = (
            f"{when.capitalize()}: {kpis['active_candidates'].display} active candidates, "
            f"{kpis['avg_engagement_time'].display} average engagement time and a "
            f"{kpis['repeat_visit_rate'].display} repeat visit rate."
        )
    rows = [
        AnalyticsRow(label=kpi.label, value=f"{kpi.display}{_change(kpi.change, kpi.change_unit)}") for kpi in view.kpis
    ]
    return reply, AnalyticsCard(title="Candidate Portal", period=period.label, rows=rows, href=href), sources


async def _demographics(session: AsyncSession, intent: AssistantIntent) -> tuple[str, AnalyticsCard, list[AISource]]:
    """The same aggregates as the Analytics page, suppression included. Never anyone's own answer."""
    summary = await demographics.aggregate(session)
    wanted = "region" if intent.metric == "regions" else intent.demographic
    dimensions = [d for d in summary.dimensions if wanted is None or d.dimension == wanted]
    href = "/recruiter/analytics#demographics"
    sources = [
        AISource(type="analytics", id="demographics", label="Voluntary demographics · all responses, aggregated")
    ]
    rows: list[AnalyticsRow] = []
    sentences: list[str] = []
    for dimension in dimensions:
        if dimension.suppressed:
            sentences.append(f"There aren't enough voluntary {dimension.label.lower()} responses to report yet.")
            continue
        top = ", ".join(f"{bucket.label} {bucket.share}%" for bucket in dimension.buckets[:4])
        sentences.append(f"**{dimension.label}** (about {dimension.respondents_approx} respondents): {top}.")
        rows.extend(
            AnalyticsRow(label=f"{dimension.label}: {bucket.label}", value=f"{bucket.share}%")
            for bucket in dimension.buckets
        )
    sentences.append(f"Groups smaller than {summary.min_group_size} are combined so no one can be identified.")
    title = "Top regions" if wanted == "region" else "Voluntary demographics"
    return " ".join(sentences), AnalyticsCard(title=title, period="All responses", rows=rows, href=href), sources


def _change(change: float | None, unit: str, comparison: str = "") -> str:
    if change is None:
        return ""
    suffix = "%" if unit == "percent" else " pts"
    rounded = round(change)
    words = f" {comparison}" if comparison else ""
    return f" ({'+' if rounded >= 0 else '−'}{abs(rounded)}{suffix}{words})"


# Jobs and candidates


async def open_jobs(session: AsyncSession) -> tuple[str, JobListCard]:
    jobs = (
        await session.scalars(select(Job).where(Job.status == JobStatus.OPEN).order_by(Job.created_at.desc()))
    ).all()
    counts = dict(
        (
            await session.execute(
                select(Application.job_id, func.count())
                .where(Application.archived_at.is_(None), Application.job_id.in_([job.id for job in jobs]))
                .group_by(Application.job_id)
            )
        ).all()
    )
    items = [
        JobListItem(
            id=job.id, title=job.title, location=job.location, status=job.status.value, candidates=counts.get(job.id, 0)
        )
        for job in jobs
    ]
    reply = (
        f"You have **{len(items)} open job{'s' if len(items) != 1 else ''}**." if items else "You have no open jobs."
    )
    return reply, JobListCard(items=items)


async def search(session: AsyncSession, intent: AssistantIntent) -> tuple[str, CandidateListCard | None]:
    """The pipeline filtered by job and stage, in its usual order (most recent activity first)."""
    job_ids: list[uuid.UUID | None] = [None]
    if intent.job_title:
        jobs = await find_jobs(session, intent.job_title)
        if not jobs:
            return f"I couldn't find a job called **{intent.job_title}**.", None
        job_ids = [job.id for job in jobs]
    items: list[CandidateBrief] = []
    total = 0
    for job_id in job_ids:
        page = await candidate_service.list_pipeline(
            session, stage=intent.stage, job_id=job_id, search=intent.candidate_name, limit=25
        )
        total += page.total
        items.extend(
            CandidateBrief(
                application_id=item.application_id,
                candidate_id=item.candidate.id,
                name=item.candidate.full_name,
                job_title=item.job.title,
                stage=item.stage,
            )
            for item in page.items
        )
    stage = intent.stage.label.lower() if intent.stage else None
    scope = f" for **{intent.job_title}**" if intent.job_title else ""
    title = (
        " · ".join(part for part in (intent.stage.label if intent.stage else None, intent.job_title) if part)
        or "Candidates"
    )
    if not total:
        return f"No candidates{f' at {stage}' if stage else ''}{scope} right now.", CandidateListCard(
            title=title, total=0, items=[]
        )
    verb = {"interview": "interviewing", "screening": "in screening", "offer": "at offer"}.get(
        stage or "", f"at {stage}" if stage else ""
    )
    reply = f"**{total} candidate{'s' if total != 1 else ''}**{(' ' + verb) if verb else ''}{scope}."
    return reply, CandidateListCard(title=title, total=total, items=items[:25])


async def next_interview(
    session: AsyncSession, application: Application, utc_offset_minutes: int
) -> tuple[str, InterviewInfoCard]:
    interview = await session.scalar(
        select(Interview)
        .where(
            Interview.application_id == application.id,
            Interview.status == InterviewStatus.SCHEDULED,
            Interview.scheduled_at > utcnow(),
        )
        .order_by(Interview.scheduled_at)
        .limit(1)
    )
    name = application.candidate.first_name
    if interview is None:
        return (
            f"{name} has no upcoming interview for {application.job.title}.",
            InterviewInfoCard(candidate=brief(application), interview=None),
        )
    item = InterviewCardItem(
        title=interview.title,
        scheduled_at=interview.scheduled_at,
        duration_minutes=interview.duration_minutes,
        interview_type=interview.interview_type.value,
        confirmed=interview.confirmed_at is not None,
        interviewers=list(interview.interviewers),
    )
    confirmed = "confirmed" if item.confirmed else "not confirmed yet"
    reply = (
        f"{name}'s next interview is the **{interview.title}** on {local_time(interview.scheduled_at, utc_offset_minutes)} "
        f"({interview.duration_minutes} min, {interview.interview_type.value}), {confirmed}."
    )
    return reply, InterviewInfoCard(candidate=brief(application), interview=item)


def local_time(moment: datetime, utc_offset_minutes: int) -> str:
    local = moment + timedelta(minutes=utc_offset_minutes)
    hour = local.hour % 12 or 12
    return f"{local:%a, %b} {local.day} at {hour}:{local.minute:02d} {'AM' if local.hour < 12 else 'PM'}"
