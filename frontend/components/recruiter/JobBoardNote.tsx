import { CalendarX, Globe, Lock } from "lucide-react";

import { formatDate, formatSalary } from "@/lib/format";
import { cn } from "@/lib/utils";
import { closingDatePassed, jobBoardHref } from "@/services/jobs";
import { SALARY_PERIODS, WORK_ARRANGEMENTS, type ManagedJob } from "@/types/job";

/** "Hybrid", "$120K–$150K a year": the board facts a job has, for the employer's own lists. */
export function jobBoardFacts(job: ManagedJob): string[] {
  const arrangement = WORK_ARRANGEMENTS.find((each) => each.value === job.workArrangement)?.label;
  const salary = formatSalary(job.salaryMin, job.salaryMax, job.salaryCurrency ?? "USD");
  const period = SALARY_PERIODS.find((each) => each.value === (job.salaryPeriod ?? "year"))?.suffix;
  return [arrangement, salary && `${salary} ${period}`].filter((fact): fact is string => Boolean(fact));
}

type Note = { tone: "listed" | "private" | "warning"; text: string };

/** Whether the job is on the Hirvello job board right now, and if not, why not. Null when there's nothing to say. */
export function jobBoardNote(job: ManagedJob, now = Date.now()): Note | null {
  if (job.external) return { tone: "private", text: "Imported, so not on the job board" };
  if (job.visibility === "private") return { tone: "private", text: "Private: not on the job board" };
  if (job.status !== "open") return null;
  // Open, but past its closing date: it left the board on its own, which the employer may not expect.
  if (job.expiresAt && closingDatePassed(job, now)) return { tone: "warning", text: `Applications closed ${formatDate(job.expiresAt)}` };
  if (!jobBoardHref(job, now)) return null;
  return { tone: "listed", text: job.expiresAt ? `On the job board · closes ${formatDate(job.expiresAt)}` : "On the job board" };
}

export function JobBoardNote({ job, className }: { job: ManagedJob; className?: string }) {
  const note = jobBoardNote(job);
  if (!note) return null;
  const Icon = note.tone === "listed" ? Globe : note.tone === "warning" ? CalendarX : Lock;
  return (
    // The date is formatted in the reader's time zone, which the server can't know: the browser's wins.
    <span suppressHydrationWarning className={cn("inline-flex items-center gap-1.5", note.tone === "warning" && "text-caution", className)}>
      <Icon aria-hidden className="size-3.5 shrink-0" /> {note.text}
    </span>
  );
}
