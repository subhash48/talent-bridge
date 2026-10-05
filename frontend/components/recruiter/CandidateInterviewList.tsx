"use client";

import { CalendarPlus } from "lucide-react";
import { useState } from "react";

import { InterviewFormat } from "@/components/shared/InterviewFormat";
import { InterviewStatusBadge } from "@/components/recruiter/InterviewStatusBadge";
import { ScheduleInterviewDialog } from "@/components/recruiter/ScheduleInterviewDialog";
import { Button } from "@/components/ui/Button";
import { formatDuration, formatSchedule } from "@/lib/format";
import type { PipelineCandidate, ScheduledInterview } from "@/types/workspace";

type CandidateInterviewListProps = {
  candidate: PipelineCandidate;
  interviews: ScheduledInterview[];
};

export function CandidateInterviewList({ candidate, interviews }: CandidateInterviewListProps) {
  const [scheduling, setScheduling] = useState(false);
  const scheduleButton = (
    <Button variant="secondary" size="sm" onClick={() => setScheduling(true)}>
      <CalendarPlus /> Schedule interview
    </Button>
  );

  return (
    <>
      {interviews.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <CalendarPlus aria-hidden className="size-5 text-stone" />
          <p className="text-sm text-stone">No interviews yet. Scheduled and past interviews appear here.</p>
          {scheduleButton}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex justify-end">{scheduleButton}</div>
          <ul className="flex flex-col gap-3">
            {interviews.map((interview) => (
              <li key={interview.id} className="rounded-[10px] border border-border bg-ink/[0.03] p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">{interview.title}</p>
                    <p className="mt-0.5 text-[13px] text-stone" suppressHydrationWarning>
                      {formatSchedule(interview.scheduledAt)} · {formatDuration(interview.durationMinutes)}
                    </p>
                  </div>
                  <InterviewStatusBadge interview={interview} />
                </div>
                <p className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-stone">
                  <InterviewFormat format={interview.format} />
                  {interview.interviewers.length > 0 && <span>With {interview.interviewers.join(", ")}</span>}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
      <ScheduleInterviewDialog candidate={candidate} open={scheduling} onOpenChange={setScheduling} />
    </>
  );
}
