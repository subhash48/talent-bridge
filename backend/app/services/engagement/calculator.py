"""Engagement Health.

Answers "does this relationship need attention?", never "is this a good candidate?". A pure function
of an application snapshot and `now`; the UI shows the level and its signals, never points.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from app.schemas.event import EngagementLevel
from app.services.engagement import rules
from app.services.engagement.snapshot import ApplicationSnapshot


@dataclass(frozen=True)
class EngagementSignal:
    key: str
    label: str
    polarity: Literal["positive", "neutral", "negative"]
    observed_at: datetime | None = None


@dataclass(frozen=True)
class EngagementResult:
    level: EngagementLevel
    signals: tuple[EngagementSignal, ...] = ()


def evaluate(snapshot: ApplicationSnapshot, now: datetime) -> EngagementResult:
    actions = snapshot.candidate_actions()
    if not actions:
        return EngagementResult(
            EngagementLevel.INSUFFICIENT,
            (EngagementSignal("no-activity", "No candidate activity yet", "neutral"),),
        )

    latest = actions[0].created_at
    recent = [action for action in actions if now - action.created_at <= rules.HIGH_WINDOW]
    if len(recent) >= rules.HIGH_MIN_ACTIONS:
        level = EngagementLevel.HIGH
    elif now - latest <= rules.MEDIUM_WINDOW:
        level = EngagementLevel.MEDIUM
    else:
        level = EngagementLevel.LOW

    signals = [
        EngagementSignal(str(action.id), action.title, "positive", action.created_at)
        for action in actions
        if now - action.created_at <= rules.SIGNAL_WINDOW
    ][: rules.MAX_SIGNALS]
    if level == EngagementLevel.LOW:
        days = (now - latest).days
        signals.append(EngagementSignal("quiet", f"No candidate activity for {days} days", "negative", latest))
    return EngagementResult(level, tuple(signals))
