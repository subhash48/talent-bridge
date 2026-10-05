"use client";

import { ArrowRight, BookOpenCheck, CircleCheck, Compass, LoaderCircle } from "lucide-react";
import Link from "next/link";

import { InterviewStatus } from "@/components/candidate/InterviewStatus";
import { Avatar } from "@/components/shared/Avatar";
import { InterviewFormat } from "@/components/shared/InterviewFormat";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { Button, buttonStyles } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useConfirmInterview } from "@/hooks/useConfirmInterview";
import { formatDayLabel, formatDuration, formatTime, pluralize } from "@/lib/format";
import type { CandidateApplication, CandidateMeResponse } from "@/types/portal";

/**
 * The one thing that matters next, in the same order as the API's next step (application.nextStep):
 * an interview to confirm or prepare for, then unread messages from the hiring team, then where the
 * application stands (at the offer stage, reviewing the offer). Only one is shown.
 */
export function NextStepCard({ me, application }: { me: CandidateMeResponse; application: CandidateApplication }) {
  const { confirm, pendingId } = useConfirmInterview();
  const active = application.status === "active";
  const interview = active ? me.nextInterview : null;
  const message = active && me.unreadMessages > 0 ? me.latestMessage : null;
  const offer = active && application.stage === "offer";

  return (
    <Card className="flex flex-col p-5 sm:p-5">
      <p className="flex items-center gap-2 text-xs font-medium text-stone">
        <Compass aria-hidden className="size-4" /> Next step
      </p>

      {interview ? (
        <>
          <h2 className="mt-3 text-lg font-semibold tracking-tight text-ink">{interview.title}</h2>
          <p className="mt-2 text-sm text-charcoal" suppressHydrationWarning>
            {formatDayLabel(interview.scheduledAt)} · {formatTime(interview.scheduledAt)}
          </p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-stone">
            <span>{formatDuration(interview.durationMinutes)}</span>
            <InterviewFormat format={interview.format} />
          </div>
          <div className="mt-3">
            <InterviewStatus interview={interview} />
          </div>
          <p className="mt-3 text-sm text-charcoal">{application.nextStep}</p>
          <div className="mt-auto flex flex-wrap gap-2 pt-5">
            {interview.canConfirm ? (
              <Button size="sm" onClick={() => void confirm(interview)} disabled={pendingId === interview.id}>
                {pendingId === interview.id ? <LoaderCircle className="animate-spin" /> : <CircleCheck />}
                {pendingId === interview.id ? "Confirming…" : "Confirm"}
              </Button>
            ) : (
              <Link href="/candidate/prep" className={buttonStyles({ variant: "ai", size: "sm" })}>
                <BookOpenCheck /> Prepare
              </Link>
            )}
            <Link href="/candidate/interviews" className={buttonStyles({ variant: "secondary", size: "sm" })}>
              View details
            </Link>
          </div>
        </>
      ) : message ? (
        <>
          <h2 className="mt-3 text-lg font-semibold tracking-tight text-ink">{pluralize(me.unreadMessages, "unread message")}</h2>
          <p className="mt-2 text-sm text-charcoal">{application.nextStep}</p>
          <div className="mt-3 flex gap-3">
            <Avatar name={message.senderName} size={28} />
            <div className="min-w-0 flex-1">
              <p className="flex items-baseline justify-between gap-2 text-[13px]">
                <span className="truncate font-medium text-charcoal">{message.senderName}</span>
                <RelativeTime iso={message.sentAt} className="shrink-0 text-xs text-faint" />
              </p>
              <p className="mt-0.5 line-clamp-2 text-sm text-charcoal">{message.body}</p>
            </div>
          </div>
          <div className="mt-auto pt-5">
            <Link href="/candidate/messages" className={buttonStyles({ variant: "secondary", size: "sm" })}>
              Open messages <ArrowRight />
            </Link>
          </div>
        </>
      ) : (
        <>
          <h2 className="mt-3 text-lg font-semibold tracking-tight text-ink">
            {!active ? application.stageLabel : offer ? "Review your offer" : "Nothing to do right now"}
          </h2>
          <p className="mt-2 text-sm text-charcoal">{application.nextStep}</p>
          {offer && (
            <div className="mt-auto pt-5">
              <Link href="/candidate/messages" className={buttonStyles({ variant: "secondary", size: "sm" })}>
                Message the team <ArrowRight />
              </Link>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
