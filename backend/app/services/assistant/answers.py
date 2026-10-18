"""The assistant's read-only answers: who needs an update, unanswered messages, interviews to confirm
or follow up on, candidate lists and interviews.

Each comes from the same service the workspace page uses (communication health from
services/communication, as on Today; candidate lists from candidate_service.list_pipeline in its
usual order), so an answer always matches what the recruiter would see there.
"""

import uuid
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.enums import CommunicationRuleKey, InterviewStatus
from app.models import Application, Interview
from app.models.base import utcnow
from app.schemas.assistant import (
    AssistantIntent,
    CandidateBrief,
    CandidateListCard,
    FollowUpItem,
    FollowUpListCard,
    InterviewCardItem,
    InterviewInfoCard,
)
from app.services import candidate_service
from app.services.assistant.resolve import find_jobs
from app.services.communication import service as communication

K = CommunicationRuleKey
SHOWN = 5  # names in a reply; the card lists the rest
WEEK = timedelta(days=7)
HELP = (
    "I help you keep every candidate informed. Try:\n"
    '- **"Who needs an update today?"**\n'
    '- **"Draft Sarah an update."** You edit and confirm before anything is sent.\n'
    '- **"Which candidates have unanswered questions?"**\n'
    '- **"Which interviews need confirmation?"**\n'
    '- **"Who interviewed this week and hasn\'t had a follow-up?"**\n'
    '- Or ask about one candidate: "Tell me about Sophia\'s application".'
)


def brief(application: Application) -> CandidateBrief:
    return CandidateBrief(
        application_id=application.id,
        candidate_id=application.candidate_id,
        name=application.candidate.full_name,
        job_title=application.job.title,
        stage=application.stage,
    )


# Communication


def _names(items: list[FollowUpItem], describe) -> str:  # type: ignore[no-untyped-def]
    lines = [f"- **{item.candidate.name}** ({item.candidate.job_title}): {describe(item)}" for item in items[:SHOWN]]
    if len(items) > SHOWN:
        lines.append(f"- …and {len(items) - SHOWN} more")
    return "\n".join(lines)


def _count(total: int, one: str, many: str) -> str:
    return f"**{total} {one if total == 1 else many}**"


async def who_needs_update(session: AsyncSession) -> tuple[str, FollowUpListCard]:
    """Everyone on Today: an SLA rule's threshold has passed."""
    attention = await communication.attention_list(session)
    items = [
        FollowUpItem(
            candidate=CandidateBrief(
                application_id=item.candidate.application_id,
                candidate_id=item.candidate.candidate_id,
                name=item.candidate.full_name,
                job_title=item.candidate.job_title,
                stage=item.stage,
            ),
            reason=item.reasons[0].title,
            detail=item.reasons[0].detail,
            since=item.reasons[0].since,
        )
        for item in attention.items
    ]
    card = FollowUpListCard(title="Needs an update", total=len(items), items=items)
    if not items:
        return "Nobody needs an update right now: every candidate has heard from you on time.", card
    reply = (
        f"{_count(len(items), 'candidate needs', 'candidates need')} an update:\n"
        + _names(items, lambda item: item.reason.lower())
        + '\n\nSay "Draft an update for …" to write one, or open Today.'
    )
    return reply, card


async def _assessed(session: AsyncSession, now: datetime):  # type: ignore[no-untyped-def]
    return await communication.assess_all(session, await communication.pipeline_applications(session), now)


async def unanswered(session: AsyncSession) -> tuple[str, FollowUpListCard]:
    """Candidates whose message (anything but a thank-you note) has no reply yet, longest waiting first."""
    now = utcnow()
    waiting = [
        (snapshot.application, health.open_question)
        for snapshot, health in await _assessed(session, now)
        if health.open_question is not None
    ]
    waiting.sort(key=lambda pair: pair[1].asked_at)
    items = [
        FollowUpItem(
            candidate=brief(application), reason="Waiting for a reply", detail=question.excerpt, since=question.asked_at
        )
        for application, question in waiting
    ]
    card = FollowUpListCard(title="Unanswered messages", total=len(items), items=items)
    if not items:
        return "No candidate is waiting for a reply.", card
    reply = f"{_count(len(items), 'candidate is', 'candidates are')} waiting for a reply:\n" + _names(
        items, lambda item: f"\u201c{item.detail}\u201d"
    )
    return reply, card


async def unconfirmed_interviews(session: AsyncSession, utc_offset_minutes: int) -> tuple[str, FollowUpListCard]:
    """Interviews in the coming week the candidate hasn't confirmed, soonest first."""
    now = utcnow()
    rows = await session.scalars(
        select(Interview)
        .join(Application, Interview.application_id == Application.id)
        .where(
            Interview.status == InterviewStatus.SCHEDULED,
            Interview.scheduled_at > now,
            Interview.scheduled_at <= now + WEEK,
            Interview.confirmed_at.is_(None),
            Application.archived_at.is_(None),
        )
        .order_by(Interview.scheduled_at)
    )
    interviews = list(rows)
    applications = {
        application.id: application
        for application in await session.scalars(
            select(Application)
            .where(Application.id.in_([interview.application_id for interview in interviews]))
            .options(selectinload(Application.candidate), selectinload(Application.job))
        )
    }
    items = [
        FollowUpItem(
            candidate=brief(applications[interview.application_id]),
            reason="Not confirmed",
            detail=interview.title,
            at=interview.scheduled_at,
        )
        for interview in interviews
        if interview.application_id in applications
    ]
    card = FollowUpListCard(title="Interviews to confirm", total=len(items), items=items)
    if not items:
        return "Every interview in the coming week is confirmed.", card
    reply = (
        f"{_count(len(items), 'interview', 'interviews')} in the coming week "
        f"{'isn' if len(items) == 1 else 'aren'}'t confirmed yet:\n"
        + _names(items, lambda item: f"{item.detail}, {local_time(item.at, utc_offset_minutes)}" if item.at else "")
        + '\n\nSay "Remind … about the interview" to draft a reminder.'
    )
    return reply, card


async def no_follow_up(session: AsyncSession) -> tuple[str, FollowUpListCard]:
    """Candidates whose interview ended in the last week and who haven't heard from us since."""
    now = utcnow()
    found = [
        (snapshot.application, health.last_interview)
        for snapshot, health in await _assessed(session, now)
        if health.last_interview is not None
        and not health.last_interview.followed_up
        and now - health.last_interview.ended_at <= WEEK
    ]
    found.sort(key=lambda pair: pair[1].ended_at)
    items = [
        FollowUpItem(
            candidate=brief(application), reason="No follow-up yet", detail=interview.title, since=interview.ended_at
        )
        for application, interview in found
    ]
    card = FollowUpListCard(title="Interviewed, no follow-up", total=len(items), items=items)
    if not items:
        return "Everyone who interviewed this week has heard from you since.", card
    reply = (
        f"{_count(len(items), 'candidate', 'candidates')} interviewed in the last week and "
        f"{'hasn' if len(items) == 1 else 'haven'}'t heard from you since:\n"
        + _names(items, lambda item: item.detail or "")
    )
    return reply, card


# Candidates and interviews


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
