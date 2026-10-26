"""Interview times from what the recruiter said: a proposal they check, never a guess they'd have to spot."""

from datetime import UTC, date, datetime

from app.schemas.assistant import ScheduleDetails
from app.services.assistant.schedule import describe, resolve_day, slots, window_for, window_from_text

MONDAY = date(2026, 10, 26)
NOW = datetime(2026, 10, 26, 15, 0, tzinfo=UTC)


def test_days_are_read_from_the_recruiters_today() -> None:
    assert resolve_day("next Tuesday", MONDAY) == date(2026, 11, 3)  # the Tuesday of next week
    assert resolve_day("Tuesday afternoon", MONDAY) == date(2026, 10, 27)  # the coming one
    assert resolve_day("this Friday", MONDAY) == date(2026, 10, 30)
    assert resolve_day("on Monday", MONDAY) == date(2026, 11, 2)  # never today
    assert resolve_day("tomorrow morning", MONDAY) == date(2026, 10, 27)
    assert resolve_day("next week", MONDAY) is None  # vaguer than a day: for the recruiter to pick
    assert resolve_day(None, MONDAY) is None


def test_windows() -> None:
    assert window_from_text("next Tuesday between 1 and 4 PM") == ("13:00", "16:00")
    assert window_from_text("between 1 and 4") == ("13:00", "16:00")  # working hours, so the afternoon
    assert window_from_text("from 10 to 11:30am") == ("10:00", "11:30")
    assert window_from_text("between 9am and 1pm") == ("09:00", "13:00")
    assert window_from_text("between 4 and 1 PM") == (None, None)
    assert window_for(ScheduleDetails(timeframe="Tuesday afternoon")) == ("13:00", "17:00")
    assert window_for(ScheduleDetails(timeframe="next Tuesday")) == ("10:00", "16:00")


def test_back_to_back_slots_in_the_recruiters_time_zone() -> None:
    # Chicago in November is UTC-6: 1 PM there is 19:00 UTC.
    proposed = slots(5, date(2026, 11, 3), ("13:00", "14:30"), 30, -360, NOW)
    starts = [slot.starts_at.isoformat() if slot else None for slot in proposed]
    assert starts == ["2026-11-03T19:00:00+00:00", "2026-11-03T19:30:00+00:00", "2026-11-03T20:00:00+00:00", None, None]
    assert describe(proposed[0], -360) == "Tuesday, November 3, 1:00 PM–1:30 PM (UTC−6)"  # type: ignore[arg-type]
    assert describe(proposed[0], 0) == "Tuesday, November 3, 7:00 PM–7:30 PM (UTC)"  # type: ignore[arg-type]
    assert slots(2, None, ("13:00", "17:00"), 30, 0, NOW) == [None, None]
    # A time already past is never proposed.
    assert slots(1, date(2026, 10, 26), ("09:00", "12:00"), 30, 0, NOW) == [None]
