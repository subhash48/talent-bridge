"""Interview times from what the recruiter said: a proposal they check, never a guess they'd have to spot."""

from datetime import UTC, date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from app.schemas.assistant import ScheduleDetails
from app.services.assistant.schedule import describe, resolve_day, slots, window_for, window_from_text, zone

MONDAY = date(2026, 10, 26)
NOW = datetime(2026, 10, 26, 15, 0, tzinfo=UTC)
CHICAGO = ZoneInfo("America/Chicago")


def test_days_are_read_from_the_recruiters_today() -> None:
    assert resolve_day("next Tuesday", MONDAY) == date(2026, 11, 3)  # the Tuesday of next week
    assert resolve_day("Tuesday afternoon", MONDAY) == date(2026, 10, 27)  # the coming one
    assert resolve_day("this Friday", MONDAY) == date(2026, 10, 30)
    assert resolve_day("on Monday", MONDAY) == date(2026, 11, 2)  # never today
    assert resolve_day("tomorrow morning", MONDAY) == date(2026, 10, 27)
    assert resolve_day("next week", MONDAY) is None  # vaguer than a day: for the recruiter to pick
    assert resolve_day("2026-11-04", MONDAY) == date(2026, 11, 4)  # picked on a calendar
    assert resolve_day("2026-10-26", MONDAY) == MONDAY  # today too: times already past are left out
    assert resolve_day("2026-10-25", MONDAY) is None  # never earlier
    assert resolve_day("Tuesday next week", MONDAY) == date(2026, 11, 3)
    assert resolve_day("next week on Tuesday", MONDAY) == date(2026, 11, 3)
    assert resolve_day("the Tuesday after next", MONDAY) == date(2026, 11, 10)
    assert resolve_day("this afternoon", MONDAY) == MONDAY
    assert resolve_day(None, MONDAY) is None


def test_windows() -> None:
    assert window_from_text("next Tuesday between 1 and 4 PM") == ("13:00", "16:00")
    assert window_from_text("between 1 and 4") == ("13:00", "16:00")  # working hours, so the afternoon
    assert window_from_text("from 10 to 11:30am") == ("10:00", "11:30")
    assert window_from_text("between 9am and 1pm") == ("09:00", "13:00")
    assert window_from_text("between 4 and 1 PM") == (None, None)
    # Spans across noon, and AM/PM said once or not at all, are read in working hours.
    assert window_from_text("between 12 and 2") == ("12:00", "14:00")
    assert window_from_text("between 11 and 1") == ("11:00", "13:00")
    assert window_from_text("between 11 and 1 PM") == ("11:00", "13:00")
    assert window_from_text("between 3pm and 5") == ("15:00", "17:00")
    assert window_from_text("between 9am and 5") == ("09:00", "17:00")
    assert window_from_text("from 10 to 2") == ("10:00", "14:00")
    assert window_from_text("9 to 5") == ("09:00", "17:00")
    assert window_from_text("1-3pm") == ("13:00", "15:00")
    assert window_from_text("10:00-11:30") == ("10:00", "11:30")
    # Open-ended: until the working day ends, or from when it starts.
    assert window_from_text("after 3pm") == ("15:00", "18:00")
    assert window_from_text("from 2 PM") == ("14:00", "18:00")
    assert window_from_text("before 11") == ("09:00", "11:00")
    assert window_from_text("next Tuesday in the afternoon") == ("13:00", "17:00")
    # Numbers that aren't times.
    assert window_from_text("a 1-2 hour interview") == (None, None)
    assert window_from_text("the top 5-10 candidates") == (None, None)
    assert window_for(ScheduleDetails(timeframe="Tuesday afternoon")) == ("13:00", "17:00")
    assert window_for(ScheduleDetails(timeframe="next Tuesday")) == ("10:00", "16:00")


def test_back_to_back_slots_in_the_recruiters_time_zone() -> None:
    # Chicago is UTC-5 on October 26 but UTC-6 by November 3: 1 PM that day is 19:00 UTC.
    proposed = slots(5, date(2026, 11, 3), ("13:00", "14:30"), 30, CHICAGO, NOW)
    starts = [slot.starts_at.isoformat() if slot else None for slot in proposed]
    assert starts == ["2026-11-03T19:00:00+00:00", "2026-11-03T19:30:00+00:00", "2026-11-03T20:00:00+00:00", None, None]
    assert describe(proposed[0], CHICAGO) == "Tuesday, November 3, 1:00 PM–1:30 PM (UTC−6)"  # type: ignore[arg-type]
    assert describe(proposed[0], UTC) == "Tuesday, November 3, 7:00 PM–7:30 PM (UTC)"  # type: ignore[arg-type]
    assert slots(2, None, ("13:00", "17:00"), 30, CHICAGO, NOW) == [None, None]
    # A time already past is never proposed.
    assert slots(1, date(2026, 10, 26), ("09:00", "12:00"), 30, UTC, NOW) == [None]


def test_the_browsers_zone_is_used_else_its_offset_today() -> None:
    assert zone("America/Chicago", -300) == CHICAGO
    assert zone(None, -300) == timezone(timedelta(hours=-5))
    assert zone("Not/AZone", 60) == timezone(timedelta(hours=1))
    assert zone("../../etc/passwd", 0) == UTC
    # A folder of zones, or a Windows-style path, falls back to the offset instead of failing.
    assert zone("America", -300) == timezone(timedelta(hours=-5))
    assert zone("America\\Chicago", -300) == timezone(timedelta(hours=-5))
