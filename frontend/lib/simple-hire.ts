import { daysLabel, openingsLabel, type Weekday } from "@/lib/days";

/** A small business's job facts, as the owner reads them at a glance. */
export type JobFactsInput = {
  pay?: string | null;
  shift?: string | null;
  work_days?: readonly Weekday[] | null;
  workDays?: readonly Weekday[] | null;
  openings?: number | null;
};

/** "$18/hour", "Evening shift", "Friday + Saturday", "2 openings": whichever the job has. */
export function jobFacts(job: JobFactsInput): string[] {
  const days = job.work_days ?? job.workDays ?? [];
  return [
    job.pay ?? null,
    job.shift ? shiftLabel(job.shift) : null,
    days.length ? daysLabel(days) : null,
    job.openings ? openingsLabel(job.openings) : null,
  ].filter((fact): fact is string => Boolean(fact));
}

/** "Evenings" reads as "Evening shift" on a job; anything else as it was said. */
export function shiftLabel(shift: string): string {
  const known: Record<string, string> = {
    Evenings: "Evening shift",
    Mornings: "Morning shift",
    Afternoons: "Afternoon shift",
    Overnight: "Overnight shift",
    Lunchtimes: "Lunchtime shift",
    Weekends: "Weekend shifts",
  };
  return known[shift] ?? shift;
}
