"""Engagement Health (ARCHITECTURE.md 5.7).

Answers "does this relationship need attention?", never "is this a good candidate?". A pure function
of an application snapshot and `now`; the UI shows the level and its signals, never points.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Literal

from app.schemas.event import EngagementLevel


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


def evaluate(snapshot: Any, now: datetime) -> EngagementResult:
    """Score the snapshot (an ApplicationSnapshot, defined later) with the rules in rules.py."""
    raise NotImplementedError  # TODO: apply the signal table and thresholds from rules.py
