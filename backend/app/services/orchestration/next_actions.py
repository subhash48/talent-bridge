"""Next-action engine: ordered rules, first match wins (ARCHITECTURE.md 5.8).

A pure function of an application snapshot and `now`. Rules decide when; AI only phrases and drafts.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Any


@dataclass(frozen=True)
class NextAction:
    type: str  # e.g. "confirm_attendance", "follow_up", "none"
    label: str
    reason: str | None = None
    follow_up: bool = False  # counts toward the "Need follow-up" metric


def evaluate(snapshot: Any, now: datetime) -> NextAction:
    """Return the first matching action for the snapshot (an ApplicationSnapshot, defined later)."""
    raise NotImplementedError  # TODO: rules R1-R7 and R0 from ARCHITECTURE.md 5.8
