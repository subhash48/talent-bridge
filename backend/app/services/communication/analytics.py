"""Communication analytics: are candidates hearing from us, and on time?

Everything is computed from the records themselves (messages, the timeline, interviews, drafts and
deliveries), so each number can be traced back to what happened.

- An obligation is something an SLA rule says the candidate is owed: an update after a stage change,
  a reply to their message, a follow-up after an interview. It was met if an update reached them
  within the rule's threshold, and at least within a day (a same-day update after a stage change is
  on time). Obligations still inside their window aren't counted yet.
- A gap is the time between two updates (or from applying to the first one). Active applications
  also count the gap they're in now, so long silences aren't left out of the median.
- Time saved is an estimate: a fixed number of minutes for each AI draft a recruiter sent.
"""

import statistics
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta
from itertools import pairwise

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.enums import (
    ActivityType,
    CommunicationRuleKey,
    DraftStatus,
    EmailStatus,
    InterviewStatus,
    MessageKind,
    SenderType,
)
from app.models import Application, CommunicationDraft, MessageDelivery
from app.models.base import utcnow
from app.schemas.communication import CommunicationAnalytics, RuleCompliance
from app.services.communication.health import ACTIVE_STAGES, OUTGOING, assess
from app.services.communication.rules import SPECS, Rules, load_rules
from app.services.engagement.snapshot import ApplicationSnapshot
from app.services.pipeline_service import load_snapshots

K = CommunicationRuleKey

MINUTES_SAVED_PER_DRAFT = 5
ON_TIME_AT_LEAST = timedelta(hours=24)
# Interviews counted for the confirmation rate: those in the period and the coming week.
UPCOMING = timedelta(days=7)
MEASURED = (K.STAGE_UPDATE, K.UNANSWERED_QUESTION, K.POST_INTERVIEW)


@dataclass(frozen=True)
class Obligation:
    rule: CommunicationRuleKey
    since: datetime  # what started the clock
    due_at: datetime
    met: bool | None  # None: still inside its window


def obligations(snapshot: ApplicationSnapshot, rules: Rules, since: datetime, now: datetime) -> list[Obligation]:
    """What the candidate was owed in the period, and whether they got it on time."""
    updates = sorted(m.created_at for m in snapshot.messages if m.sender_type in OUTGOING)
    found: list[Obligation] = []

    def owed(rule: CommunicationRuleKey, started: datetime) -> None:
        if not rules[rule].enabled or not since <= started <= now:
            return
        due_at = started + max(rules[rule].threshold, ON_TIME_AT_LEAST)
        reply = next((at for at in updates if at > started), None)
        met = True if reply is not None and reply <= due_at else (None if due_at > now else False)
        found.append(Obligation(rule, started, due_at, met))

    for activity in snapshot.activities:
        if activity.activity_type == ActivityType.STAGE_CHANGED:
            owed(K.STAGE_UPDATE, activity.created_at)
    waiting: datetime | None = None  # the first of their messages since our last update
    for message in snapshot.messages:
        if message.sender_type in OUTGOING:
            waiting = None
        elif message.sender_type == SenderType.CANDIDATE and message.kind != MessageKind.THANK_YOU and waiting is None:
            waiting = message.created_at
            owed(K.UNANSWERED_QUESTION, waiting)
    for interview in snapshot.interviews:
        if interview.status != InterviewStatus.CANCELLED:
            ended = interview.scheduled_at + timedelta(minutes=interview.duration_minutes)
            if ended <= now:
                owed(K.POST_INTERVIEW, ended)
    return found


def gaps(snapshot: ApplicationSnapshot, since: datetime, now: datetime) -> list[timedelta]:
    """Time between updates that ended in the period, and the current one for an active application."""
    application = snapshot.application
    points = [application.applied_at, *sorted(m.created_at for m in snapshot.messages if m.sender_type in OUTGOING)]
    found = [after - before for before, after in pairwise(points) if since <= after <= now]
    if application.archived_at is None and application.stage in ACTIVE_STAGES:
        found.append(now - points[-1])
    return found


def _rate(part: int, whole: int) -> float | None:
    return round(part / whole, 4) if whole else None


async def communication_analytics(
    session: AsyncSession, days: int, now: datetime | None = None
) -> CommunicationAnalytics:
    now = now or utcnow()
    since = now - timedelta(days=days)
    rules = await load_rules(session)
    applications = list(
        await session.scalars(
            select(Application).options(selectinload(Application.candidate), selectinload(Application.job))
        )
    )
    snapshots: Sequence[ApplicationSnapshot] = await load_snapshots(session, applications)

    needs_attention = unanswered = 0
    all_gaps: list[timedelta] = []
    owed: list[Obligation] = []
    interviews_total = interviews_confirmed = updates_sent = 0
    for snapshot in snapshots:
        health = assess(snapshot, rules, now)
        if health.attention:
            needs_attention += 1
        if snapshot.application.archived_at is None and health.open_question is not None:
            unanswered += 1
        all_gaps += gaps(snapshot, since, now)
        owed += obligations(snapshot, rules, since, now)
        updates_sent += sum(
            1 for m in snapshot.messages if m.sender_type == SenderType.RECRUITER and since <= m.created_at <= now
        )
        for interview in snapshot.interviews:
            if interview.status != InterviewStatus.CANCELLED and since <= interview.scheduled_at <= now + UPCOMING:
                interviews_total += 1
                interviews_confirmed += interview.confirmed_at is not None

    decided = [o for o in owed if o.met is not None]
    compliance = [
        RuleCompliance(
            rule=rule,
            title=SPECS[rule].title,
            met=sum(1 for o in decided if o.rule == rule and o.met),
            total=sum(1 for o in decided if o.rule == rule),
        )
        for rule in MEASURED
        if rules[rule].enabled
    ]

    emails = dict(
        (
            await session.execute(
                select(MessageDelivery.email_status, func.count())
                .where(MessageDelivery.attempted_at >= since)
                .group_by(MessageDelivery.email_status)
            )
        ).all()
    )
    drafts = list(
        await session.scalars(
            select(CommunicationDraft).where(
                (CommunicationDraft.created_at >= since)
                | (CommunicationDraft.sent_at >= since)
                | (CommunicationDraft.discarded_at >= since)
            )
        )
    )
    sent = [d for d in drafts if d.status == DraftStatus.SENT and d.sent_at and d.sent_at >= since]
    return CommunicationAnalytics(
        days=days,
        since=since,
        needs_attention=needs_attention,
        unanswered_messages=unanswered,
        median_hours_between_updates=(
            round(statistics.median(gap.total_seconds() for gap in all_gaps) / 3600, 1) if all_gaps else None
        ),
        sla_compliance=_rate(sum(1 for o in decided if o.met), len(decided)),
        compliance=compliance,
        interview_confirmation_rate=_rate(interviews_confirmed, interviews_total),
        interviews_confirmed=interviews_confirmed,
        interviews_total=interviews_total,
        updates_sent=updates_sent,
        emails_sent=emails.get(EmailStatus.SENT, 0),
        emails_failed=emails.get(EmailStatus.FAILED, 0),
        drafts_generated=sum(1 for d in drafts if d.created_at >= since),
        drafts_sent=len(sent),
        drafts_sent_unedited=sum(1 for d in sent if (d.subject, d.body) == (d.ai_subject, d.ai_body)),
        drafts_discarded=sum(
            1 for d in drafts if d.status == DraftStatus.DISCARDED and d.discarded_at and d.discarded_at >= since
        ),
        minutes_saved=len(sent) * MINUTES_SAVED_PER_DRAFT,
        minutes_saved_per_draft=MINUTES_SAVED_PER_DRAFT,
    )
