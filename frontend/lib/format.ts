const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * DAY],
  ["month", 30 * DAY],
  ["week", 7 * DAY],
  ["day", DAY],
  ["hour", HOUR],
  ["minute", MINUTE],
];

const relativeFormatter = new Intl.RelativeTimeFormat("en", { numeric: "always" });
const timeFormatter = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });
const shortDayFormatter = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" });
const longDayFormatter = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" });
const dateFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
const dateTimeFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

/** "2 hours ago", "1 day ago", "in 3 days". */
export function formatRelativeTime(iso: string, now = Date.now()): string {
  const diff = new Date(iso).getTime() - now;
  const distance = Math.abs(diff);
  if (distance < MINUTE) return "just now";
  for (const [unit, size] of RELATIVE_UNITS) {
    if (distance >= size) return relativeFormatter.format(Math.trunc(diff / size), unit);
  }
  return "just now";
}

function calendarDayOffset(iso: string, now: number): number {
  const date = new Date(iso);
  const today = new Date(now);
  const startOf = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  return Math.round((startOf(date) - startOf(today)) / DAY);
}

/** "Today", "Tomorrow", "Yesterday", or "Mon, Oct 6" ("Monday, October 6" when long). */
export function formatDayLabel(iso: string, { long = false, now = Date.now() } = {}): string {
  const offset = calendarDayOffset(iso, now);
  if (offset === 0) return "Today";
  if (offset === 1) return "Tomorrow";
  if (offset === -1) return "Yesterday";
  return (long ? longDayFormatter : shortDayFormatter).format(new Date(iso));
}

/** "10:00 AM". */
export function formatTime(iso: string): string {
  return timeFormatter.format(new Date(iso));
}

/** "Tomorrow · 10:00 AM". */
export function formatSchedule(iso: string): string {
  return `${formatDayLabel(iso)} · ${formatTime(iso)}`;
}

/** "Oct 3, 2026". */
export function formatDate(iso: string): string {
  return dateFormatter.format(new Date(iso));
}

/** "Oct 3, 2026, 10:00 AM", for tooltips next to relative times. */
export function formatDateTime(iso: string): string {
  return dateTimeFormatter.format(new Date(iso));
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
}

export function isWithin(iso: string, milliseconds: number, now = Date.now()): boolean {
  return now - new Date(iso).getTime() < milliseconds;
}

export const DURATION = { MINUTE, HOUR, DAY } as const;

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

export function greetingFor(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/** Possessive pronoun from a candidate's stated pronouns; "their" when none are recorded. */
export function possessivePronoun(pronouns?: string): string {
  const subject = pronouns?.split("/")[0]?.trim().toLowerCase();
  if (subject === "she") return "her";
  if (subject === "he") return "his";
  return "their";
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
