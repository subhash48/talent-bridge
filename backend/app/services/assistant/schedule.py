"""Interview times from what the recruiter said: "next Tuesday between 1 and 4 PM", "Tuesday afternoon".

Only a proposal: a day and back-to-back slots in a window, in the recruiter's own time zone, for them to
check and change before anything is created. Nothing is guessed that they'd have to spot: a request
with no day leaves the day for them to pick, and candidates the window has no room for get no time.
The time zone is the browser's named one, so a day after the clocks change gets that day's offset.
"""

import re
from datetime import UTC, date, datetime, time, timedelta, timezone, tzinfo
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.schemas.assistant import OutreachSlot, ScheduleDetails

DAYS = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")
WINDOWS = {"morning": ("09:00", "12:00"), "afternoon": ("13:00", "17:00"), "evening": ("17:00", "19:00")}
DEFAULT_WINDOW = ("10:00", "16:00")
DEFAULT_MINUTES = 30
_I = re.IGNORECASE
_HOUR = r"(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?"
_BETWEEN = re.compile(rf"\b(?:between|from)\s+{_HOUR}\s*(?:and|to|-|–)\s*{_HOUR}", _I)


def window_from_text(text: str) -> tuple[str | None, str | None]:
    """ "between 1 and 4 PM" is 13:00-16:00; "from 10 to 11:30am" is 10:00-11:30."""
    match = _BETWEEN.search(text)
    if not match:
        return None, None
    h1, m1, p1, h2, m2, p2 = match.groups()
    end_period = (p2 or "").lower().replace(".", "")
    start_period = (p1 or "").lower().replace(".", "") or end_period
    start = _clock(int(h1), int(m1 or 0), start_period)
    end = _clock(int(h2), int(m2 or 0), end_period)
    if start is None or end is None:
        return None, None
    if not p1 and not p2 and int(h1) < 8:  # "between 1 and 4": an afternoon, in working hours
        start, end = _clock(int(h1), int(m1 or 0), "pm"), _clock(int(h2), int(m2 or 0), "pm")
    if start is None or end is None or start >= end:
        return None, None
    return start, end


def _clock(hour: int, minute: int, period: str) -> str | None:
    if period == "pm" and hour < 12:
        hour += 12
    elif period == "am" and hour == 12:
        hour = 0
    if not (0 <= hour <= 23 and 0 <= minute <= 59):
        return None
    return f"{hour:02d}:{minute:02d}"


def resolve_day(timeframe: str | None, today: date) -> date | None:
    """The day a timeframe names, from the recruiter's today: a date picked on a calendar ("2026-11-03"), or
    words. "next Tuesday" is the Tuesday of next week; "Tuesday" or "this Tuesday" the coming one;
    "tomorrow" tomorrow. Anything vaguer is for them to pick, and a day already past is never proposed."""
    words = (timeframe or "").lower().strip()
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", words):  # a day picked on a calendar
        try:
            picked = date.fromisoformat(words)
        except ValueError:
            return None
        return picked if picked > today else None
    if "tomorrow" in words:
        return today + timedelta(days=1)
    for index, name in enumerate(DAYS):
        if name in words:
            ahead = (index - today.weekday()) % 7 or 7
            if re.search(rf"\bnext\s+{name}", words):
                next_monday = today + timedelta(days=7 - today.weekday())
                return next_monday + timedelta(days=index)
            return today + timedelta(days=ahead)
    return None


def window_for(details: ScheduleDetails) -> tuple[str, str]:
    if details.window_start and details.window_end:
        return details.window_start, details.window_end
    words = (details.timeframe or "").lower()
    return next((window for name, window in WINDOWS.items() if name in words), DEFAULT_WINDOW)


def zone(time_zone: str | None, utc_offset_minutes: int) -> tzinfo:
    """The recruiter's time zone: the browser's named one (America/Chicago), else the offset they're at now."""
    if time_zone:
        try:
            return ZoneInfo(time_zone)
        except (ZoneInfoNotFoundError, ValueError):
            pass
    return timezone(timedelta(minutes=utc_offset_minutes))


def slots(
    count: int, day: date | None, window: tuple[str, str], minutes: int, tz: tzinfo, now: datetime
) -> list[OutreachSlot | None]:
    """Back-to-back slots from the window's start, one per candidate, in UTC. None once the window is full,
    or when there's no day yet; never a time already past."""
    if day is None:
        return [None] * count
    cursor = datetime.combine(day, time.fromisoformat(window[0]), tzinfo=tz).astimezone(UTC)
    end = datetime.combine(day, time.fromisoformat(window[1]), tzinfo=tz).astimezone(UTC)
    length = timedelta(minutes=minutes)
    result: list[OutreachSlot | None] = []
    for _ in range(count):
        if cursor + length > end or cursor <= now:
            result.append(None)
        else:
            result.append(OutreachSlot(starts_at=cursor, ends_at=cursor + length))
        cursor += length
    return result


def describe(slot: OutreachSlot, tz: tzinfo) -> str:
    """ "Tuesday, November 3, 1:00 PM–1:30 PM (UTC−6)": in the recruiter's time zone, with that day's offset."""
    start, end = slot.starts_at.astimezone(tz), slot.ends_at.astimezone(tz)
    minutes = int((start.utcoffset() or timedelta()).total_seconds() // 60)
    hours, rest = divmod(abs(minutes), 60)
    label = "UTC" if minutes == 0 else f"UTC{'+' if minutes > 0 else '−'}{hours}{f':{rest:02d}' if rest else ''}"
    return f"{start:%A}, {start:%B} {start.day}, {_time(start)}–{_time(end)} ({label})"


def _time(moment: datetime) -> str:
    hour = moment.hour % 12 or 12
    return f"{hour}:{moment:%M} {'AM' if moment.hour < 12 else 'PM'}"
