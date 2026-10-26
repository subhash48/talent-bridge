/** A day of the week, as the API stores a job's work days and an applicant's availability. */
export type Weekday = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";

export const WEEKDAYS: readonly Weekday[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

export function dayLabel(day: Weekday): string {
  return day.charAt(0).toUpperCase() + day.slice(1);
}

/** Days as a person says them, Monday first: "Friday + Saturday", "Weekends", "Weekdays", "Every day". */
export function daysLabel(days: readonly Weekday[]): string {
  const set = new Set(days);
  const ordered = WEEKDAYS.filter((day) => set.has(day));
  if (ordered.length === 7) return "Every day";
  if (ordered.length === 2 && set.has("saturday") && set.has("sunday")) return "Weekends";
  if (ordered.length === 5 && !set.has("saturday") && !set.has("sunday")) return "Weekdays";
  return ordered.map(dayLabel).join(" + ");
}

/** "2 openings", "1 opening". */
export function openingsLabel(count: number): string {
  return `${count} opening${count === 1 ? "" : "s"}`;
}

/** "13:00" as people say it: "1 PM"; "14:30" is "2:30 PM". */
export function clockLabel(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  const suffix = hours >= 12 ? "PM" : "AM";
  const hour = hours % 12 || 12;
  return minutes ? `${hour}:${String(minutes).padStart(2, "0")} ${suffix}` : `${hour} ${suffix}`;
}

/** A calendar day as the API sends it ("2026-10-27") the way people say it: "Tuesday, October 27". Anything
 * else is shown as it came. */
export function calendarDayLabel(day: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return day;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  return date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
}
