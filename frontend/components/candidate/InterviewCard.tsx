"use client";

import { BookOpenCheck, CalendarPlus, CircleCheck, ExternalLink, LoaderCircle } from "lucide-react";
import Link from "next/link";

import { InterviewStatus } from "@/components/candidate/InterviewStatus";
import { InterviewFormat } from "@/components/shared/InterviewFormat";
import { Button, buttonStyles } from "@/components/ui/Button";
import { downloadInterviewIcs } from "@/lib/calendar";
import { formatDayLabel, formatDuration, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CandidateInterview } from "@/types/portal";

const monthFormatter = new Intl.DateTimeFormat("en-US", { month: "short" });

type InterviewCardProps = {
  interview: CandidateInterview;
  company: string;
  onConfirm: (interview: CandidateInterview) => void;
  confirming: boolean;
};

/** One interview with what the candidate can do about it: confirm, join, add to calendar, prepare. */
export function InterviewCard({ interview, company, onConfirm, confirming }: InterviewCardProps) {
  const start = new Date(interview.scheduledAt);
  const end = new Date(start.getTime() + interview.durationMinutes * 60_000);
  const inactive = interview.status === "cancelled" || !interview.upcoming;

  return (
    <article
      aria-labelledby={`interview-${interview.id}`}
      className={cn("glass flex flex-col gap-4 rounded-[14px] border border-border p-5 sm:flex-row sm:gap-5 sm:p-5", inactive && "opacity-80")}
    >
      <div
        aria-hidden
        className="flex size-14 shrink-0 flex-col items-center justify-center rounded-[12px] bg-ink/[0.05] ring-1 ring-ink/10"
        suppressHydrationWarning
      >
        <span className="text-[11px] font-medium tracking-wide text-stone uppercase" suppressHydrationWarning>
          {monthFormatter.format(start)}
        </span>
        <span className="text-xl leading-none font-semibold text-ink tabular-nums" suppressHydrationWarning>
          {start.getDate()}
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h3 id={`interview-${interview.id}`} className="text-base font-semibold tracking-tight text-ink">
            {interview.title}
          </h3>
          <InterviewStatus interview={interview} />
        </div>
        <p className="mt-1.5 text-sm text-charcoal" suppressHydrationWarning>
          <time dateTime={interview.scheduledAt}>
            {formatDayLabel(interview.scheduledAt, { long: true })} · {formatTime(interview.scheduledAt)} – {formatTime(end.toISOString())}
          </time>
        </p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] text-stone">
          <InterviewFormat format={interview.format} />
          <span>{formatDuration(interview.durationMinutes)}</span>
          {interview.interviewers.length > 0 && <span>With {interview.interviewers.join(", ")}</span>}
        </div>
        {interview.confirmedAt && interview.upcoming && (
          <p className="mt-3 inline-flex items-center gap-1.5 text-[13px] text-sage">
            <CircleCheck aria-hidden className="size-4" /> You confirmed this interview. The team knows you’re coming.
          </p>
        )}

        {interview.upcoming && (
          <div className="mt-4 flex flex-wrap gap-2">
            {interview.canConfirm && (
              <Button size="sm" onClick={() => onConfirm(interview)} disabled={confirming} aria-label={`Confirm ${interview.title}`}>
                {confirming ? <LoaderCircle className="animate-spin" /> : <CircleCheck />}
                {confirming ? "Confirming…" : "Confirm interview"}
              </Button>
            )}
            {interview.meetingUrl && (
              <a
                href={interview.meetingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonStyles({ variant: "secondary", size: "sm" })}
              >
                <ExternalLink /> Open meeting link
              </a>
            )}
            <Button variant="secondary" size="sm" onClick={() => downloadInterviewIcs(interview, company)}>
              <CalendarPlus /> Add to calendar
            </Button>
            <Link href="/candidate/prep" className={buttonStyles({ variant: "ai", size: "sm" })}>
              <BookOpenCheck /> View preparation
            </Link>
          </div>
        )}
      </div>
    </article>
  );
}
