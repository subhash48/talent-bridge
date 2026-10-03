import Link from "next/link";

import { InterviewFormat } from "@/components/recruiter/InterviewFormat";
import { InterviewStatusBadge } from "@/components/recruiter/InterviewStatusBadge";
import { Avatar } from "@/components/shared/Avatar";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { formatDuration, formatTime } from "@/lib/format";
import type { ScheduledInterview } from "@/types/workspace";

/** One interview in the schedule. "past" swaps the time column for when it happened. */
export function InterviewRow({ interview, past }: { interview: ScheduledInterview; past?: boolean }) {
  return (
    <li className="flex flex-col gap-3 rounded-[14px] px-3 py-3.5 transition-colors hover:bg-white/[0.03] @xl:flex-row @xl:items-center @xl:gap-5">
      <div className="flex shrink-0 items-baseline gap-2 @xl:w-24 @xl:flex-col @xl:gap-0.5">
        {past ? (
          <RelativeTime iso={interview.scheduledAt} className="text-sm font-medium text-ink" />
        ) : (
          <time dateTime={interview.scheduledAt} className="text-[15px] font-medium text-ink tabular-nums">
            {formatTime(interview.scheduledAt)}
          </time>
        )}
        <span className="text-[13px] text-stone">{formatDuration(interview.durationMinutes)}</span>
      </div>
      <Link
        href={`/recruiter/candidates?candidate=${interview.candidate.id}`}
        className="group flex min-w-0 flex-1 items-center gap-3 rounded-[10px]"
      >
        <Avatar name={interview.candidate.name} src={interview.candidate.avatarUrl} size={40} />
        <span className="min-w-0">
          <span className="block truncate font-medium text-ink group-hover:underline group-hover:decoration-white/30 group-hover:underline-offset-4">
            {interview.candidate.name}
          </span>
          <span className="block truncate text-[13px] text-stone">
            {interview.title} · {interview.candidate.role}
          </span>
        </span>
      </Link>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-stone @xl:justify-end">
        <span className="flex flex-col gap-0.5 @xl:items-end">
          <InterviewFormat format={interview.format} />
          <span>{interview.interviewers.join(", ")}</span>
        </span>
        <InterviewStatusBadge interview={interview} />
      </div>
    </li>
  );
}
