"""Response opportunities: times we genuinely asked the candidate for something, and how they answered.

- A recruiter message opens one (a run of them opens one, at the first). The candidate's next
  message answers it. A candidate message that answers nothing is one they started themselves.
- A scheduled interview opens one; confirming it answers it.
- An opportunity still open after the response window is a missed one. A younger one is pending and
  doesn't count either way.
- The clock only runs while the candidate could see the request: from when they could first use
  the portal. Without portal access, an unanswered request isn't held against them at all.

Pure functions of the records and `now`, so the results are deterministic and testable.
"""

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta

from app.core.enums import InterviewStatus, MessageKind, SenderType

ASKING_SENDERS = frozenset({SenderType.RECRUITER})  # automated system messages don't ask anything


@dataclass(frozen=True)
class MessageFact:
    sender: SenderType
    kind: MessageKind
    created_at: datetime


@dataclass(frozen=True)
class InterviewFact:
    created_at: datetime
    scheduled_at: datetime
    status: InterviewStatus
    confirmed_at: datetime | None


@dataclass(frozen=True)
class ResponseStats:
    opportunities: int  # answered + missed; pending ones aren't counted
    responses: int
    pending: int
    durations: tuple[timedelta, ...]  # time to each answer, oldest first
    initiated_messages: int  # messages the candidate started (kind message or question)
    notes: dict[MessageKind, int]  # thank-you notes and follow-ups, however they were sent
    confirmations: int
    confirmation_opportunities: int  # interviews confirmed + interviews missed

    @property
    def missed(self) -> int:
        return self.opportunities - self.responses


def response_stats(
    threads: Iterable[Sequence[MessageFact]],
    interviews: Iterable[InterviewFact],
    *,
    portal_since: datetime | None,
    now: datetime,
    window: timedelta,
) -> ResponseStats:
    """threads: each application's messages, oldest first."""
    answered: list[tuple[datetime, timedelta]] = []
    missed = pending = initiated = 0
    notes = {MessageKind.THANK_YOU: 0, MessageKind.FOLLOW_UP: 0}

    def unanswered(opened: datetime, deadline: datetime) -> str | None:
        """missed, pending, or None when the candidate couldn't see the request at all."""
        visible_from = _visible_from(opened, portal_since)
        if visible_from is None:
            return None
        return "missed" if deadline - visible_from >= window else "pending"

    for thread in threads:
        opened: datetime | None = None
        for message in thread:
            if message.sender in ASKING_SENDERS:
                opened = opened or message.created_at
            elif message.sender == SenderType.CANDIDATE:
                if message.kind in notes:
                    notes[message.kind] += 1
                if opened is not None:
                    answered.append((message.created_at, _elapsed(opened, message.created_at, portal_since)))
                    opened = None
                elif message.kind not in notes:
                    initiated += 1
        if opened is not None:
            outcome = unanswered(opened, now)
            missed += outcome == "missed"
            pending += outcome == "pending"

    confirmations = confirmations_missed = 0
    for interview in interviews:
        if interview.confirmed_at is not None:
            confirmations += 1
            answered.append(
                (interview.confirmed_at, _elapsed(interview.created_at, interview.confirmed_at, portal_since))
            )
        elif interview.status == InterviewStatus.CANCELLED:
            continue
        elif interview.status == InterviewStatus.SCHEDULED and interview.scheduled_at > now:
            outcome = unanswered(interview.created_at, now)
            confirmations_missed += outcome == "missed"
            pending += outcome == "pending"
        # It took place unconfirmed: missed if they had the whole window before it, else too short
        # a notice to count either way.
        elif unanswered(interview.created_at, interview.scheduled_at) == "missed":
            confirmations_missed += 1
    missed += confirmations_missed

    answered.sort(key=lambda item: item[0])
    return ResponseStats(
        opportunities=len(answered) + missed,
        responses=len(answered),
        pending=pending,
        durations=tuple(duration for _, duration in answered),
        initiated_messages=initiated,
        notes=notes,
        confirmations=confirmations,
        confirmation_opportunities=confirmations + confirmations_missed,
    )


def _visible_from(opened: datetime, portal_since: datetime | None) -> datetime | None:
    if portal_since is None:
        return None
    return max(opened, portal_since)


def _elapsed(opened: datetime, answered: datetime, portal_since: datetime | None) -> timedelta:
    """Time to answer, counted from when they could see the request (never negative)."""
    start = max(opened, portal_since) if portal_since is not None and portal_since <= answered else opened
    return max(answered - start, timedelta(0))
