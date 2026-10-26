"""No calendar is connected, so none is claimed: the provider says so, in words a recruiter can read."""

from datetime import UTC, datetime

from app.integrations.calendar import NOT_CONFIGURED, CalendarEvent, DisabledCalendar, get_calendar_provider


async def test_without_a_calendar_no_event_is_claimed() -> None:
    provider = get_calendar_provider()
    assert isinstance(provider, DisabledCalendar) and provider.configured is False
    result = await provider.create_event(
        CalendarEvent(
            title="First interview: Sophia Martinez",
            starts_at=datetime(2026, 11, 3, 19, 0, tzinfo=UTC),
            duration_minutes=30,
            attendee_email="sophia.martinez@example.com",
            organizer="alex.chen@encord.example",
        )
    )
    assert (result.status, result.event_id, result.meeting_url) == ("not_configured", None, None)
    assert result.error == NOT_CONFIGURED == "Calendar integration required to create real calendar events."
