"""Interview times from what the recruiter said: "next Tuesday between 1 and 4 PM", "Tuesday afternoon",
"Tuesday next week after 3pm".

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
_TIME = r"(?:\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?|noon|midday)"
_NOT_A_TIME = r"(?!\s*(?:-\s*)?(?:minutes?|mins?|hours?|hrs?|candidates?|people|applicants?|days?|weeks?)\b)"
_RANGE = re.compile(
    rf"\b(?:between|from)\s+(?P<start>{_TIME})\s*(?:and|to|until|till|-|–)\s*(?P<end>{_TIME}){_NOT_A_TIME}"
    rf"|\b(?P<start2>\d{{1,2}}(?::\d{{2}})?\s*(?:am|pm)?)\s*(?:-|–|to)\s*(?P<end2>\d{{1,2}}(?::\d{{2}})?\s*(?:am|pm)?)\b"
    rf"{_NOT_A_TIME}",
    _I,
)
_AFTER = re.compile(rf"\b(?:after|from|starting(?: at| from)?|at)\s+(?P<time>{_TIME}){_NOT_A_TIME}", _I)
_BEFORE = re.compile(rf"\b(?:before|until|till|by)\s+(?P<time>{_TIME}){_NOT_A_TIME}", _I)
_PART_OF_DAY = re.compile(r"\b(morning|afternoon|evening)\b", _I)
_ZONE_NAME = re.compile(r"[A-Za-z][A-Za-z0-9_+\-]*(?:/[A-Za-z0-9_+\-]+){1,2}|UTC|GMT")


def window_from_text(text: str) -> tuple[str | None, str | None]:
    """The window said, in working hours when AM/PM is left out: "between 1 and 4 PM" is 13:00-16:00,
    "between 11 and 1" 11:00-13:00, "9 to 5" 09:00-17:00, "after 3pm" 15:00-18:00, "before 11" 09:00-11:00,
    "in the afternoon" 13:00-17:00. Nothing said, or nothing that makes a window: (None, None)."""
    for match in _RANGE.finditer(text):
        said = match.group("start", "end") if match.group("start") else match.group("start2", "end2")
        start, end = _range(*said)
        if start is not None:
            return start, end
    after = _AFTER.search(text)
    start = _point(after.group("time")) if after else None
    if start is not None and start < "23:00":
        return start, max("18:00", _shift(start, 180))  # from then until the end of the working day
    before = _BEFORE.search(text)
    end = _point(before.group("time")) if before else None
    if end is not None and end > "06:00":
        return ("09:00" if end > "10:00" else _shift(end, -180)), end  # from the start of the working day
    part = _PART_OF_DAY.search(text)
    return WINDOWS[part.group(1).lower()] if part else (None, None)


def _parse(said: str) -> tuple[int, int, str]:
    """ "1:30 pm" is (1, 30, "pm"); "noon" (12, 0, "pm"); a bare "4" (4, 0, "")."""
    words = said.lower().replace(".", "").strip()
    if words in ("noon", "midday"):
        return 12, 0, "pm"
    match = re.fullmatch(r"(\d{1,2})(?::(\d{2}))?\s*(am|pm)?", words)
    assert match is not None
    return int(match.group(1)), int(match.group(2) or 0), match.group(3) or ""


def _working(hour: int) -> str:
    """AM or PM for an hour said without one, in working hours: 7 to 11 is the morning, 12 to 6 the afternoon."""
    return "am" if 7 <= hour <= 11 else "pm"


def _range(start_said: str, end_said: str) -> tuple[str | None, str | None]:
    h1, m1, p1 = _parse(start_said)
    h2, m2, p2 = _parse(end_said)
    other = {"am": "pm", "pm": "am"}
    if p1 and p2:
        readings = [(p1, p2)]
    elif p2:  # "between 11 and 1 PM": 11 AM to 1 PM
        readings = [(p2, p2), (other[p2], p2)]
    elif p1:  # "between 9am and 5": 9 AM to 5 PM
        readings = [(p1, p1), (p1, other[p1])]
    else:
        readings = [(_working(h1), _working(h2))]
    for first, second in readings:
        start, end = _clock(h1, m1, first), _clock(h2, m2, second)
        # A reading that was guessed ("between 4 and 1 PM" as 4 AM) has to be in working hours.
        guessed = not (p1 and p2)
        if (
            start is not None
            and end is not None
            and start < end
            and (not guessed or "06:00" <= start <= end <= "23:00")
        ):
            return start, end
    return None, None


def _point(said: str) -> str | None:
    hour, minute, period = _parse(said)
    return _clock(hour, minute, period or _working(hour))


def _shift(clock: str, minutes: int) -> str:
    """The clock time this many minutes later (or earlier), kept within the day."""
    hour, minute = map(int, clock.split(":"))
    total = min(max(hour * 60 + minute + minutes, 6 * 60), 23 * 60)
    return f"{total // 60:02d}:{total % 60:02d}"


def _clock(hour: int, minute: int, period: str) -> str | None:
    if period == "pm" and hour < 12:
        hour += 12
    elif period == "am" and hour == 12:
        hour = 0
    if not (0 <= hour <= 23 and 0 <= minute <= 59):
        return None
    return f"{hour:02d}:{minute:02d}"


def resolve_day(timeframe: str | None, today: date) -> date | None:
    """The day a timeframe names, from the recruiter's today: a date picked on a calendar ("2026-11-03", today
    included: times already past are left out), or words. "next Tuesday", "Tuesday next week" and "next week
    on Tuesday" are the Tuesday of next week, and "the Tuesday after next" the one after; "Tuesday" or "this
    Tuesday" the coming one; "today" and "this afternoon" today; "tomorrow" tomorrow. Anything vaguer is for
    them to pick, and a day already past is never proposed."""
    words = (timeframe or "").lower().strip()
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", words):  # a day picked on a calendar
        try:
            picked = date.fromisoformat(words)
        except ValueError:
            return None
        return picked if picked >= today else None
    if re.search(r"\b(today|tonight|this (morning|afternoon|evening))\b", words):
        return today
    if "tomorrow" in words:
        return today + timedelta(days=1)
    for index, name in enumerate(DAYS):
        if name in words:
            next_week = today + timedelta(days=7 - today.weekday() + index)
            if re.search(r"\bafter next\b", words):
                return next_week + timedelta(days=7)
            if re.search(rf"\bnext\s+{name}|\b{name}\s+next\s+week|\bnext\s+week\b", words):
                return next_week
            return today + timedelta(days=(index - today.weekday()) % 7 or 7)
    return None


def window_for(details: ScheduleDetails) -> tuple[str, str]:
    if details.window_start and details.window_end:
        return details.window_start, details.window_end
    words = (details.timeframe or "").lower()
    return next((window for name, window in WINDOWS.items() if name in words), DEFAULT_WINDOW)


def zone(time_zone: str | None, utc_offset_minutes: int) -> tzinfo:
    """The recruiter's time zone: the browser's named one (America/Chicago), else the offset they're at now.
    Only a well-formed name is looked up; "America" (a folder of zones) or a path falls back to the offset."""
    if time_zone and _ZONE_NAME.fullmatch(time_zone):
        try:
            return ZoneInfo(time_zone)
        except (ZoneInfoNotFoundError, ValueError, OSError):
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
