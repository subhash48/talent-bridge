"""Candidate engagement: a transparent 0-100 indicator for recruiters, with its breakdown.

    Portal activity          30   visits, active time, meaningful views
    Responsiveness           40   share of requests answered, typical response time
    Proactive communication  30   messages they started, interview confirmations, notes

It is informational only. Engagement is not candidate quality: how often someone visits a portal or
how fast they reply says nothing about whether they can do the job, and plenty of strong candidates
are busy. So the score never rejects, advances or ranks anyone, never changes a stage, never feeds a
qualification or fit score, and is never given to the AI (services/ai/context.py has no field for
it). It is shown on the recruiter's screen with its reasons, and nowhere else; candidates never see
it.

A pure function of the facts, `now` and the configuration: the same inputs always give the same
breakdown, and the three parts always add up to the score.
"""

import statistics
import uuid
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from app.core.enums import EngagementEventType, EngagementLevel, MessageKind
from app.services.engagement.config import DEFAULT_CONFIG, EngagementScoreConfig, SessionConfig
from app.services.engagement.responses import InterviewFact, MessageFact, response_stats

# Views that show interest in the process (not generic page loads).
MEANINGFUL_VIEWS = frozenset(
    {
        EngagementEventType.APPLICATION_VIEWED,
        EngagementEventType.INTERVIEW_VIEWED,
        EngagementEventType.PREP_VIEWED,
        EngagementEventType.MESSAGE_READ,
    }
)
LABELS = {
    EngagementLevel.HIGH: "High engagement",
    EngagementLevel.MEDIUM: "Moderate engagement",
    EngagementLevel.LOW: "Low engagement",
    EngagementLevel.INSUFFICIENT: "Insufficient data",
}


@dataclass(frozen=True)
class SessionFact:
    visit_id: uuid.UUID  # the browser tab's visit
    started_at: datetime
    last_active_at: datetime
    active_seconds: int


@dataclass(frozen=True)
class ViewFact:
    event_type: str
    target: str | None  # e.g. the interview viewed
    occurred_at: datetime


@dataclass(frozen=True)
class EngagementFacts:
    """Everything the score is computed from, for one application or for the candidate overall."""

    sessions: Sequence[SessionFact] = ()
    views: Sequence[ViewFact] = ()
    threads: Sequence[Sequence[MessageFact]] = ()  # each application's messages, oldest first
    interviews: Sequence[InterviewFact] = ()
    portal_since: datetime | None = None  # when the candidate could first use the portal


@dataclass(frozen=True)
class PortalActivity:
    score: int
    max: int
    neutral: bool  # never had portal access: half points, not zero
    visits: int
    active_minutes: int
    meaningful_views: int
    last_active_at: datetime | None


@dataclass(frozen=True)
class Responsiveness:
    score: int
    max: int
    neutral: bool  # never asked anything: half points, not zero
    response_opportunities: int
    responses: int
    pending: int
    median_response_minutes: int | None
    last_response_minutes: int | None


@dataclass(frozen=True)
class Communication:
    score: int
    max: int
    initiated_messages: int
    confirmations: int
    confirmation_opportunities: int
    thank_you_notes: int
    follow_ups: int


@dataclass(frozen=True)
class EngagementScore:
    score: int | None  # None while there's too little to go on
    level: EngagementLevel
    sufficient_data: bool
    portal_activity: PortalActivity
    responsiveness: Responsiveness
    communication: Communication
    data_points: int
    version: str = field(default=DEFAULT_CONFIG.version)

    @property
    def label(self) -> str:
        return LABELS[self.level]

    @property
    def proactive_actions(self) -> int:
        c = self.communication
        return c.initiated_messages + c.confirmations + c.thank_you_notes + c.follow_ups


def score_engagement(
    facts: EngagementFacts, now: datetime, config: EngagementScoreConfig = DEFAULT_CONFIG
) -> EngagementScore:
    portal = _portal_activity(facts, config)
    stats = response_stats(
        facts.threads, facts.interviews, portal_since=facts.portal_since, now=now, window=config.response_window
    )
    durations = stats.durations[-config.recent_responses :]
    median = statistics.median(durations) if durations else None

    if stats.opportunities == 0:
        responsiveness_points, responsiveness_neutral = config.responsiveness_max * config.neutral_share, True
    else:
        completion = config.completion_points * stats.responses / stats.opportunities
        speed = _speed_points(median, config) if median is not None else 0.0
        responsiveness_points, responsiveness_neutral = completion + speed, False
    responsiveness = Responsiveness(
        score=_points(responsiveness_points, config.responsiveness_max),
        max=config.responsiveness_max,
        neutral=responsiveness_neutral,
        response_opportunities=stats.opportunities,
        responses=stats.responses,
        pending=stats.pending,
        median_response_minutes=_minutes(median),
        last_response_minutes=_minutes(stats.durations[-1]) if stats.durations else None,
    )

    thank_yous = stats.notes[MessageKind.THANK_YOU]
    follow_ups = stats.notes[MessageKind.FOLLOW_UP]
    confirmation_share = (
        stats.confirmations / stats.confirmation_opportunities
        if stats.confirmation_opportunities
        else config.neutral_share
    )
    communication = Communication(
        score=_points(
            config.initiated_points * _saturate(stats.initiated_messages, config.initiated_half_life)
            + config.confirmations_points * confirmation_share
            + config.notes_points * _saturate(thank_yous + follow_ups, config.notes_half_life),
            config.communication_max,
        ),
        max=config.communication_max,
        initiated_messages=stats.initiated_messages,
        confirmations=stats.confirmations,
        confirmation_opportunities=stats.confirmation_opportunities,
        thank_you_notes=thank_yous,
        follow_ups=follow_ups,
    )

    data_points = (
        portal.visits + stats.opportunities + stats.initiated_messages + stats.confirmations + thank_yous + follow_ups
    )
    sufficient = data_points >= config.min_data_points
    total = portal.score + responsiveness.score + communication.score
    if not sufficient:
        level = EngagementLevel.INSUFFICIENT
    elif total >= config.high_threshold:
        level = EngagementLevel.HIGH
    elif total >= config.moderate_threshold:
        level = EngagementLevel.MEDIUM
    else:
        level = EngagementLevel.LOW
    return EngagementScore(
        score=total if sufficient else None,
        level=level,
        sufficient_data=sufficient,
        portal_activity=portal,
        responsiveness=responsiveness,
        communication=communication,
        data_points=data_points,
        version=config.version,
    )


def count_visits(sessions: Sequence[SessionFact], config: SessionConfig = DEFAULT_CONFIG.sessions) -> int:
    """Distinct visits. Visits starting within visit_gap of the last counted one are the same visit,
    so opening several tabs or reloading doesn't add up."""
    starts = sorted({session.visit_id: session.started_at for session in sessions}.values())
    visits, last = 0, None
    for start in starts:
        if last is None or start - last >= config.visit_gap:
            visits, last = visits + 1, start
    return visits


def active_minutes(sessions: Sequence[SessionFact], config: SessionConfig = DEFAULT_CONFIG.sessions) -> int:
    cap = int(config.session_cap.total_seconds())
    return sum(min(max(session.active_seconds, 0), cap) for session in sessions) // 60


def _portal_activity(facts: EngagementFacts, config: EngagementScoreConfig) -> PortalActivity:
    visits = count_visits(facts.sessions, config.sessions)
    minutes = active_minutes(facts.sessions, config.sessions)
    views = len(
        {
            (view.event_type, view.target, view.occurred_at.date())
            for view in facts.views
            if view.event_type in MEANINGFUL_VIEWS
        }
    )
    last_active = max((session.last_active_at for session in facts.sessions), default=None)
    neutral = facts.portal_since is None and not facts.sessions
    if neutral:
        points = config.portal_max * config.neutral_share
    else:
        points = (
            config.visits_points * _saturate(visits, config.visits_half_life)
            + config.active_minutes_points * _saturate(minutes, config.active_minutes_half_life)
            + config.views_points * _saturate(views, config.views_half_life)
        )
    return PortalActivity(
        score=_points(points, config.portal_max),
        max=config.portal_max,
        neutral=neutral,
        visits=visits,
        active_minutes=minutes,
        meaningful_views=views,
        last_active_at=last_active,
    )


def _speed_points(median: timedelta, config: EngagementScoreConfig) -> float:
    if median <= config.speed_full_within:
        return config.speed_points
    late = (median - config.speed_full_within) / config.speed_half_life
    return config.speed_points * 0.5**late


def _saturate(count: float, half_life: float) -> float:
    """0 for nothing, approaching 1 with diminishing returns; half at half_life."""
    return 1 - 0.5 ** (max(count, 0) / half_life)


def _points(value: float, maximum: int) -> int:
    return min(maximum, max(0, int(value + 0.5)))


def _minutes(duration: timedelta | None) -> int | None:
    return None if duration is None else round(duration.total_seconds() / 60)
