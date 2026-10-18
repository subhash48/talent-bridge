"""Communication health: what one candidate has heard from us, what they're waiting for, and which
SLA rules need attention.

A pure function of an application snapshot, the rules and `now`. An update is any message the
candidate received from the hiring team (a recruiter's, or the system's); stage changes, interviews
and the like only count once someone tells the candidate about them. Sending one update clears every
rule that was waiting on one; an interview stays unconfirmed until the candidate confirms it or is
reminded.
"""

import uuid
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from app.core.enums import (
    ActivityType,
    ApplicationStage,
    CommunicationRuleKey,
    CommunicationStatus,
    InterviewStatus,
    MessageKind,
    SenderType,
)
from app.models import Interview, Message
from app.services.communication.rules import Rules
from app.services.snapshot import ApplicationSnapshot

K = CommunicationRuleKey
S = ApplicationStage

ACTIVE_STAGES = frozenset({S.SOURCED, S.SCREENING, S.INTERVIEW, S.OFFER})
# What the candidate receives from the hiring team.
OUTGOING = frozenset({SenderType.RECRUITER, SenderType.SYSTEM})
# How far ahead "due soon" looks.
SOON = timedelta(hours=24)
# A hired or rejected candidate's application is only flagged for what happened this recently: a
# message owed months ago is a missed SLA for the analytics, not something to act on today.
CLOSED_LOOKBACK = timedelta(days=30)
EXCERPT = 140


@dataclass(frozen=True)
class Attention:
    """One rule whose threshold has passed."""

    rule: CommunicationRuleKey
    title: str
    detail: str
    since: datetime  # when the clock started: the stage change, their message, the interview's end...
    due_at: datetime
    interview_id: uuid.UUID | None = None
    message_id: uuid.UUID | None = None


@dataclass(frozen=True)
class OpenQuestion:
    message_id: uuid.UUID  # their latest unanswered message
    asked_at: datetime  # their first unanswered message: how long they've waited
    excerpt: str
    count: int


@dataclass(frozen=True)
class InterviewCheck:
    """The next interview, and whether the candidate confirmed it."""

    interview_id: uuid.UUID
    title: str
    scheduled_at: datetime
    confirmed: bool


@dataclass(frozen=True)
class FollowUpCheck:
    """The latest interview that has ended, and whether the candidate heard from us since."""

    interview_id: uuid.UUID
    title: str
    ended_at: datetime
    followed_up: bool


@dataclass(frozen=True)
class StageChange:
    stage: ApplicationStage
    changed_at: datetime
    told: bool  # the candidate has had a message since


@dataclass(frozen=True)
class Health:
    status: CommunicationStatus
    last_update_at: datetime | None
    waiting_since: datetime  # the last update, or when they applied
    open_question: OpenQuestion | None = None
    next_interview: InterviewCheck | None = None
    last_interview: FollowUpCheck | None = None
    stage_change: StageChange | None = None
    attention: list[Attention] = field(default_factory=list)  # in rule order
    next_due_at: datetime | None = None  # the next rule to need attention, when none does yet

    def days_since_update(self, now: datetime) -> int:
        return max(0, (now - self.waiting_since).days)


def assess(snapshot: ApplicationSnapshot, rules: Rules, now: datetime) -> Health:
    application = snapshot.application
    outgoing = [message for message in snapshot.messages if message.sender_type in OUTGOING]
    last_update_at = outgoing[-1].created_at if outgoing else None
    waiting_since = max(last_update_at or application.applied_at, application.applied_at)

    def told_since(moment: datetime) -> bool:
        return last_update_at is not None and last_update_at > moment

    change = next((a for a in snapshot.activities if a.activity_type == ActivityType.STAGE_CHANGED), None)
    stage_change = StageChange(application.stage, change.created_at, told_since(change.created_at)) if change else None
    open_question = _open_question(snapshot.messages, last_update_at)
    upcoming = snapshot.upcoming_interview(now)
    next_interview = (
        InterviewCheck(upcoming.id, upcoming.title, upcoming.scheduled_at, upcoming.confirmed_at is not None)
        if upcoming
        else None
    )
    ended = _last_ended(snapshot.interviews, now)
    last_interview = (
        FollowUpCheck(ended.id, ended.title, _end(ended), told_since(_end(ended))) if ended is not None else None
    )
    facts = Health(
        status=CommunicationStatus.CLOSED,
        last_update_at=last_update_at,
        waiting_since=waiting_since,
        open_question=open_question,
        next_interview=next_interview,
        last_interview=last_interview,
        stage_change=stage_change,
    )
    if application.archived_at is not None:
        return facts  # out of the pipeline: nothing is owed

    active = application.stage in ACTIVE_STAGES
    attention: list[Attention] = []
    upcoming_due: list[datetime] = []

    def check(key: CommunicationRuleKey, since: datetime, detail: str, **ids: uuid.UUID) -> None:
        rule = rules[key]
        if not rule.enabled or (not active and now - since > CLOSED_LOOKBACK):
            return
        due_at = (since - rule.threshold) if key == K.INTERVIEW_UNCONFIRMED else (since + rule.threshold)
        if due_at > now:
            upcoming_due.append(due_at)
        else:
            attention.append(Attention(key, rule.spec.title, detail, since, due_at, **ids))

    if stage_change and not stage_change.told:
        check(K.STAGE_UPDATE, stage_change.changed_at, f"Moved to {application.stage.label}")
    if open_question:
        check(K.UNANSWERED_QUESTION, open_question.asked_at, open_question.excerpt, message_id=open_question.message_id)
    if active and last_interview and not last_interview.followed_up:
        check(K.POST_INTERVIEW, last_interview.ended_at, last_interview.title, interview_id=last_interview.interview_id)
    if active and next_interview and not next_interview.confirmed:
        reminder_from = next_interview.scheduled_at - rules[K.INTERVIEW_UNCONFIRMED].threshold
        if not told_since(reminder_from):  # a reminder inside the window clears it
            check(
                K.INTERVIEW_UNCONFIRMED,
                next_interview.scheduled_at,
                next_interview.title,
                interview_id=next_interview.interview_id,
            )
    if active and next_interview is None:
        detail = "No update since they applied" if last_update_at is None else "No update since your last message"
        check(K.NO_RECENT_UPDATE, waiting_since, detail)

    next_due_at = min(upcoming_due, default=None)
    if attention:
        status = CommunicationStatus.NEEDS_ATTENTION
    elif next_due_at is not None and next_due_at - now <= SOON:
        status = CommunicationStatus.DUE_SOON
    elif active:
        status = CommunicationStatus.ON_TRACK
    else:
        status = CommunicationStatus.CLOSED
    order = list(K)
    attention.sort(key=lambda item: order.index(item.rule))
    return Health(
        status=status,
        last_update_at=last_update_at,
        waiting_since=waiting_since,
        open_question=open_question,
        next_interview=next_interview,
        last_interview=last_interview,
        stage_change=stage_change,
        attention=attention,
        next_due_at=next_due_at,
    )


def _open_question(messages: Sequence[Message], last_update_at: datetime | None) -> OpenQuestion | None:
    """The candidate's messages since our last update that want a reply (a thank-you note doesn't)."""
    waiting = [
        message
        for message in messages
        if message.sender_type == SenderType.CANDIDATE
        and message.kind != MessageKind.THANK_YOU
        and (last_update_at is None or message.created_at > last_update_at)
    ]
    if not waiting:
        return None
    latest = waiting[-1]
    text = " ".join(latest.content.split())
    excerpt = text if len(text) <= EXCERPT else f"{text[: EXCERPT - 1]}…"
    return OpenQuestion(latest.id, waiting[0].created_at, excerpt, len(waiting))


def _end(interview: Interview) -> datetime:
    return interview.scheduled_at + timedelta(minutes=interview.duration_minutes)


def _last_ended(interviews: Sequence[Interview], now: datetime) -> Interview | None:
    ended = [
        interview
        for interview in interviews
        if interview.status != InterviewStatus.CANCELLED and _end(interview) <= now
    ]
    return max(ended, key=_end, default=None)
