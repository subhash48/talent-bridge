"""Calendar events for interviews, behind one small interface.

No calendar is connected yet, so every interview is created in TalentBridge only, and nothing claims a
calendar invitation went out: DisabledCalendar says so, and the recruiter sees "Calendar integration
required to create real calendar events." Google Calendar or Microsoft Outlook plug in here later, as
another CalendarProvider: the interview flow (services/assistant/outreach.py) already asks the provider
for each interview it creates and records what it answered.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Literal

CalendarStatus = Literal["created", "not_configured", "failed"]
NOT_CONFIGURED = "Calendar integration required to create real calendar events."


@dataclass(frozen=True)
class CalendarEvent:
    title: str
    starts_at: datetime  # UTC
    duration_minutes: int
    attendee_email: str
    organizer: str
    description: str = ""
    meeting_url: str | None = None  # only one the recruiter gave; a provider may add its own
    # Sent as the provider's idempotency key (the interview id), so a retry is one event.
    idempotency_key: str | None = None
    interviewers: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class CalendarResult:
    status: CalendarStatus
    provider: str | None = None
    event_id: str | None = None
    meeting_url: str | None = None  # a real link the provider created, never an invented one
    error: str | None = None  # safe to show a recruiter


class CalendarProvider(ABC):
    name: str
    configured: bool

    @abstractmethod
    async def create_event(self, event: CalendarEvent) -> CalendarResult: ...


class DisabledCalendar(CalendarProvider):
    """No calendar connected: interviews live in TalentBridge, and no invitation is claimed."""

    name = "none"
    configured = False

    async def create_event(self, event: CalendarEvent) -> CalendarResult:
        return CalendarResult("not_configured", error=NOT_CONFIGURED)


def get_calendar_provider() -> CalendarProvider:
    # Google Calendar and Microsoft Outlook go here, chosen by their settings, when they're added.
    return DisabledCalendar()
