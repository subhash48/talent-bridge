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
