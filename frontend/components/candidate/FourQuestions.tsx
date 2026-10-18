"use client";

import { ArrowRight, BookOpenCheck, CircleCheck, Compass, Hand, LoaderCircle, MapPin, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Button, buttonStyles } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useConfirmInterview } from "@/hooks/useConfirmInterview";
import { formatDayLabel, formatTime, pluralize } from "@/lib/format";
import type { CandidateApplication, CandidateMeResponse } from "@/types/portal";

/**
 * The four things a candidate wants to know, answered plainly: where they are, what happens next,
 * whether anything is waiting on them, and how to prepare. Never anything the hiring team keeps to
 * itself: the status and next step are the portal's candidate-safe ones.
 */
export function FourQuestions({ me, application }: { me: CandidateMeResponse; application: CandidateApplication }) {
  const { confirm, pendingId } = useConfirmInterview();
  const active = application.status === "active";
  const interview = active ? me.nextInterview : null;
  const preparing = active && (application.stage === "interview" || interview !== null);

  let action: { answer: ReactNode; control?: ReactNode };
  if (interview?.canConfirm) {
    action = {
      answer: (
        <>
          Yes: confirm your <strong className="font-medium text-ink">{interview.title}</strong> on{" "}
          <span suppressHydrationWarning>
            {formatDayLabel(interview.scheduledAt).toLowerCase()} at {formatTime(interview.scheduledAt)}
          </span>
          .
        </>
      ),
      control: (
        <Button size="sm" onClick={() => void confirm(interview)} disabled={pendingId === interview.id}>
          {pendingId === interview.id ? <LoaderCircle className="animate-spin" /> : <CircleCheck />}
          {pendingId === interview.id ? "Confirming…" : "Confirm"}
        </Button>
      ),
    };
  } else if (active && me.unreadMessages > 0) {
    action = {
      answer: `Yes: you have ${pluralize(me.unreadMessages, "new message")} from the hiring team.`,
      control: (
        <Link href="/candidate/messages" className={buttonStyles({ size: "sm" })}>
          Read <ArrowRight />
        </Link>
      ),
    };
  } else if (active && application.stage === "offer") {
    action = {
      answer: "Yes: review your offer, and reply to the team with any questions.",
      control: (
        <Link href="/candidate/messages" className={buttonStyles({ size: "sm" })}>
          Message the team <ArrowRight />
        </Link>
      ),
    };
  } else {
    action = { answer: active ? "No. Nothing is waiting on you: we'll update you here." : "No." };
  }

  return (
    <Card className="p-0">
      <dl className="divide-y divide-border">
        <Answer icon={MapPin} question="Where am I?">
          <span className="font-medium text-ink">{application.stageLabel}</span>
        </Answer>
        <Answer icon={Compass} question="What happens next?">
          {application.nextStep}
        </Answer>
        <Answer icon={Hand} question="Do I need to do anything?" control={action.control}>
          {action.answer}
        </Answer>
        {active && (
          <Answer
            icon={BookOpenCheck}
            question="How should I prepare?"
            control={
              preparing ? (
                <Link href="/candidate/prep" className={buttonStyles({ variant: "ai", size: "sm" })}>
                  <BookOpenCheck /> Prepare
                </Link>
              ) : (
                <Link href="/candidate/company" className={buttonStyles({ variant: "secondary", size: "sm" })}>
                  About {me.company}
                </Link>
              )
            }
          >
            {preparing
              ? `Your preparation is ready${interview ? ` for the ${interview.title}` : ""}: what to expect, questions to practise, and a mock interview.`
              : "Preparation opens when you're invited to interview. Until then, get to know the company."}
          </Answer>
        )}
      </dl>
    </Card>
  );
}

function Answer({
  icon: Icon,
  question,
  control,
  children,
}: {
  icon: LucideIcon;
  question: string;
  control?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4 sm:p-5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-ink/[0.05] ring-1 ring-ink/10">
        <Icon aria-hidden strokeWidth={1.75} className="size-4 text-charcoal" />
      </span>
      <div className="min-w-0 flex-1">
        <dt className="text-xs text-stone">{question}</dt>
        <dd className="mt-0.5 text-[15px] leading-snug text-charcoal">{children}</dd>
      </div>
      {control && <div className="shrink-0">{control}</div>}
    </div>
  );
}
