"""Every number behind candidate engagement, in one place, versioned so a score can be explained later.

The score is an operational indicator for recruiters: how much a candidate has been able to and did
engage with our process. It is never a measure of quality and nothing consumes it except the
recruiter's own screen (see scoring.py).
"""

from dataclasses import dataclass, field
from datetime import timedelta


@dataclass(frozen=True)
class SessionConfig:
    """How the portal's heartbeats turn into active time. The server times them; the browser reports
    no durations. The portal only sends heartbeats while the tab is visible and in use."""

    heartbeat_interval: timedelta = timedelta(seconds=30)  # what the portal sends (for reference)
    min_interval: timedelta = timedelta(seconds=15)  # sooner than this is a duplicate and adds nothing
    max_credit: timedelta = timedelta(seconds=60)  # one heartbeat can add at most this much
    idle_timeout: timedelta = timedelta(minutes=2)  # a longer gap (hidden tab, idle) adds nothing
    session_cap: timedelta = timedelta(minutes=60)  # one visit can count for at most this much
    visit_gap: timedelta = timedelta(minutes=30)  # visits starting closer together than this count once


@dataclass(frozen=True)
class EngagementScoreConfig:
    """Points per component and how they are earned. Each component's parts add up to its maximum.

    Counts earn points with diminishing returns: points * (1 - 0.5 ** (count / half_life)), so the
    first few actions matter most and repeating one (refreshing, sending ten messages) can never add
    more than its cap.
    """

    version: str = "2.0"

    # Portal activity: 30
    visits_points: float = 10
    visits_half_life: float = 2
    active_minutes_points: float = 12
    active_minutes_half_life: float = 10
    views_points: float = 8  # application, interview, prep and message reads, distinct per day
    views_half_life: float = 3

    # Responsiveness: 40
    completion_points: float = 20  # share of response opportunities answered
    speed_points: float = 20  # by the median response time
    speed_full_within: timedelta = timedelta(hours=24)
    speed_half_life: timedelta = timedelta(hours=48)  # beyond that, points halve every this long
    response_window: timedelta = timedelta(hours=72)  # unanswered for longer: a missed opportunity
    recent_responses: int = 20  # the median covers the most recent responses only

    # Proactive communication: 30
    initiated_points: float = 10  # messages the candidate started, not replies
    initiated_half_life: float = 1
    confirmations_points: float = 10  # share of interviews the candidate confirmed
    notes_points: float = 10  # thank-you notes and follow-ups
    notes_half_life: float = 1

    # A component the candidate had no chance to earn (never had portal access, was never asked
    # anything, had no interview to confirm) scores this share of its points instead of zero.
    neutral_share: float = 0.5

    high_threshold: int = 70
    moderate_threshold: int = 40
    # Fewer visits, responses and actions than this together is too little to judge.
    min_data_points: int = 3

    sessions: SessionConfig = field(default_factory=SessionConfig)

    @property
    def portal_max(self) -> int:
        return round(self.visits_points + self.active_minutes_points + self.views_points)

    @property
    def responsiveness_max(self) -> int:
        return round(self.completion_points + self.speed_points)

    @property
    def communication_max(self) -> int:
        return round(self.initiated_points + self.confirmations_points + self.notes_points)


DEFAULT_CONFIG = EngagementScoreConfig()
