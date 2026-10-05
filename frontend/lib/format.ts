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

/** Time spent, rounded so it never looks more precise than it is: "Under a minute", "23 min", "1 hr 5 min". */
export function formatActiveTime(minutes: number): string {
  return minutes < 1 ? "Under a minute" : formatDuration(Math.round(minutes));
}

/** A typical response time, approximately: "~34 min", "~5 hr", "~2 days". */
export function formatResponseTime(minutes: number): string {
  if (minutes < 1) return "Under a minute";
  if (minutes < 60) return `~${Math.round(minutes)} min`;
  if (minutes < 48 * 60) return `~${Math.round(minutes / 60)} hr`;
  return `~${Math.round(minutes / (24 * 60))} days`;
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

const CURRENCY_SYMBOLS: Record<string, string> = { USD: "$", GBP: "£", EUR: "€", CAD: "CA$", INR: "₹" };

/** A yearly pay range as a job shows it: "$100K–$130K", "From $90K", "Up to $120K". Null without one. */
export function formatSalary(min: number | null, max: number | null, currency = "USD"): string | null {
  const symbol = CURRENCY_SYMBOLS[currency] ?? `${currency} `;
  const amount = (value: number) => (value >= 1000 ? `${symbol}${Number((value / 1000).toFixed(1))}K` : `${symbol}${value.toLocaleString()}`);
  if (min && max) return `${amount(min)}–${amount(max)}`;
  if (min) return `From ${amount(min)}`;
  if (max) return `Up to ${amount(max)}`;
  return null;
}
