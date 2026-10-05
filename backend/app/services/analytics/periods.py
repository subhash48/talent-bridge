"""The date range an analytics view covers, in the recruiter's local days, and the one it compares with.

Ranges are whole local days: [first day 00:00, day after the last 00:00), converted to UTC with the
browser's offset. The comparison period is the same length, immediately before.
"""

from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta

from app.core.errors import BadRequestError
from app.models.base import utcnow
from app.schemas.analytics import AnalyticsPeriod, RangePreset

MAX_CUSTOM_DAYS = 3 * 366

PRESET_LABELS: dict[str, str] = {
    "today": "Today",
    "last_7_days": "Last 7 days",
    "last_30_days": "Last 30 days",
    "last_90_days": "Last 90 days",
    "this_year": "This year",
}
PRESET_DAYS = {"today": 1, "last_7_days": 7, "last_30_days": 30, "last_90_days": 90}


@dataclass(frozen=True)
class Period:
    preset: RangePreset
    label: str
    start: datetime  # UTC
    end: datetime  # UTC, exclusive
    offset: timedelta  # local = UTC + offset
    now: datetime

    @property
    def previous_start(self) -> datetime:
        return self.start - (self.end - self.start)

    @property
    def previous_end(self) -> datetime:
        return self.start

    def local(self, moment: datetime) -> datetime:
        return (moment.astimezone(UTC) + self.offset).replace(tzinfo=None)

    def local_day(self, moment: datetime) -> date:
        return self.local(moment).date()

    @property
    def first_day(self) -> date:
        return self.local_day(self.start)

    @property
    def last_day(self) -> date:
        return self.local_day(self.end - timedelta(microseconds=1))

    def read(self) -> AnalyticsPeriod:
        return AnalyticsPeriod(
            preset=self.preset,
            label=self.label,
            start=self.start,
            end=self.end,
            previous_start=self.previous_start,
            previous_end=self.previous_end,
            utc_offset_minutes=int(self.offset.total_seconds() // 60),
        )


def resolve_period(
    preset: RangePreset,
    *,
    utc_offset_minutes: int = 0,
    start: date | None = None,
    end: date | None = None,
    now: datetime | None = None,
) -> Period:
    now = now or utcnow()
    offset = timedelta(minutes=utc_offset_minutes)
    today = (now.astimezone(UTC) + offset).date()
    if preset == "custom":
        if start is None or end is None:
            raise BadRequestError("Choose a start and an end date for a custom range.", code="invalid_range")
        if start > end:
            raise BadRequestError("The start date must be on or before the end date.", code="invalid_range")
        if (end - start).days >= MAX_CUSTOM_DAYS:
            raise BadRequestError("Choose a range of at most three years.", code="invalid_range")
        first, last = start, end
        label = _range_label(first, last)
    elif preset == "this_year":
        first, last = date(today.year, 1, 1), today
        label = PRESET_LABELS[preset]
    else:
        first, last = today - timedelta(days=PRESET_DAYS[preset] - 1), today
        label = PRESET_LABELS[preset]
    return Period(
        preset=preset,
        label=label,
        start=_utc(first, offset),
        end=_utc(last + timedelta(days=1), offset),
        offset=offset,
        now=now,
    )


def _utc(day: date, offset: timedelta) -> datetime:
    return datetime.combine(day, time(), tzinfo=UTC) - offset


def _range_label(first: date, last: date) -> str:
    if first == last:
        return f"{first:%b} {first.day}, {first.year}"
    if first.year == last.year:
        return f"{first:%b} {first.day} – {last:%b} {last.day}, {last.year}"
    return f"{first:%b} {first.day}, {first.year} – {last:%b} {last.day}, {last.year}"
