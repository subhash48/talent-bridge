"use client";

import { CalendarDays, CircleCheck, LoaderCircle } from "lucide-react";
import Link from "next/link";

import { InterviewStatus } from "@/components/candidate/InterviewStatus";
import { InterviewFormat } from "@/components/shared/InterviewFormat";
import { Button, buttonStyles } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useConfirmInterview } from "@/hooks/useConfirmInterview";
import { formatDayLabel, formatDuration, formatTime } from "@/lib/format";
import type { CandidateInterview } from "@/types/portal";

export function NextInterviewCard({ interview }: { interview: CandidateInterview | null }) {
  const { confirm, pendingId } = useConfirmInterview();

  return (
    <Card className="flex flex-col p-5 sm:p-6">
      <p className="flex items-center gap-2 text-[13px] font-medium text-stone">
        <CalendarDays aria-hidden className="size-4" /> Next interview
      </p>
      {interview ? (
        <>
          <h2 className="mt-3 text-xl font-semibold tracking-tight text-ink">{interview.title}</h2>
          <p className="mt-2 text-[15px] text-charcoal" suppressHydrationWarning>
            {formatDayLabel(interview.scheduledAt)} · {formatTime(interview.scheduledAt)}
          </p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-stone">
            <span>{formatDuration(interview.durationMinutes)}</span>
            <InterviewFormat format={interview.format} />
          </div>
          <div className="mt-3">
            <InterviewStatus interview={interview} />
          </div>
          <div className="mt-auto flex flex-wrap gap-2 pt-6">
            <Link href="/candidate/interviews" className={buttonStyles({ variant: "secondary", size: "sm" })}>
              View details
            </Link>
            {interview.canConfirm ? (
              <Button size="sm" onClick={() => void confirm(interview)} disabled={pendingId === interview.id}>
                {pendingId === interview.id ? <LoaderCircle className="animate-spin" /> : <CircleCheck />}
                {pendingId === interview.id ? "Confirming…" : "Confirm"}
              </Button>
            ) : (
              interview.confirmedAt && (
                <span className="inline-flex h-8 items-center gap-1.5 px-1 text-xs font-medium text-emerald-200">
                  <CircleCheck aria-hidden className="size-4" /> Confirmed
                </span>
              )
            )}
          </div>
        </>
      ) : (
        <div className="flex flex-1 flex-col justify-center py-6">
          <p className="font-medium text-ink">No upcoming interviews yet.</p>
          <p className="mt-1 text-sm text-stone">When your recruiter schedules one, it’ll appear here.</p>
        </div>
      )}
    </Card>
  );
}
