import { CalendarPlus } from "lucide-react";

import { InterviewFormat } from "@/components/recruiter/InterviewFormat";
import { InterviewStatusBadge } from "@/components/recruiter/InterviewStatusBadge";
import { formatDuration, formatSchedule } from "@/lib/format";
import type { ScheduledInterview } from "@/types/workspace";

export function CandidateInterviewList({ interviews }: { interviews: ScheduledInterview[] }) {
  if (interviews.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <CalendarPlus aria-hidden className="size-5 text-stone" />
        <p className="text-sm text-stone">No interviews yet. Scheduled and past interviews appear here.</p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {interviews.map((interview) => (
        <li key={interview.id} className="rounded-[14px] bg-white/[0.03] p-4 ring-1 ring-white/[0.07]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium text-ink">{interview.title}</p>
              <p className="mt-0.5 text-sm text-stone" suppressHydrationWarning>
                {formatSchedule(interview.scheduledAt)} · {formatDuration(interview.durationMinutes)}
              </p>
            </div>
            <InterviewStatusBadge interview={interview} />
          </div>
          <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-stone">
            <InterviewFormat format={interview.format} />
            <span>With {interview.interviewers.join(", ")}</span>
          </p>
        </li>
      ))}
    </ul>
  );
}
