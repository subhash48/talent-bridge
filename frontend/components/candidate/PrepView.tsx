"use client";

import {
  BookOpenCheck,
  Building2,
  CalendarPlus,
  CircleCheck,
  Compass,
  Lightbulb,
  LoaderCircle,
  MessageCircleQuestion,
  ShieldCheck,
  Target,
  type LucideIcon,
} from "lucide-react";
import { useEffect } from "react";

import { AskAssistant } from "@/components/candidate/AskAssistant";
import { useCandidatePortal } from "@/components/candidate/CandidatePortalProvider";
import { CandidateHeader } from "@/components/candidate/CandidateHeader";
import { InterviewStatus } from "@/components/candidate/InterviewStatus";
import { LoadError } from "@/components/candidate/LoadError";
import { InterviewFormat } from "@/components/shared/InterviewFormat";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { useConfirmInterview } from "@/hooks/useConfirmInterview";
import { useLiveQuery } from "@/hooks/useLiveQuery";
import { downloadInterviewIcs } from "@/lib/calendar";
import { formatDayLabel, formatDuration, formatTime } from "@/lib/format";
import { getCandidatePrep, recordPrepViewed } from "@/services/portal";
import type { CandidateInterview, CandidatePrep } from "@/types/portal";

const loadPrep = () => getCandidatePrep();
const PREP_REFRESH_MS = 5 * 60_000;

type PrepList = "whatToExpect" | "roleFocus" | "topicsToReview" | "companyInfo" | "questionsToAsk" | "practiceQuestions";

const SECTIONS: { field: PrepList; title: string; icon: LucideIcon; hint?: string }[] = [
  { field: "whatToExpect", title: "What to expect", icon: Compass },
  { field: "roleFocus", title: "Role focus", icon: Target },
  { field: "topicsToReview", title: "Suggested topics to review", icon: BookOpenCheck },
  { field: "companyInfo", title: "About the company", icon: Building2, hint: "Company-approved information" },
  { field: "questionsToAsk", title: "Questions you may want to ask", icon: MessageCircleQuestion },
  { field: "practiceQuestions", title: "Practice questions", icon: Lightbulb },
];

export function PrepView() {
  const { data: prep, error, loading, refresh, setData } = useLiveQuery(loadPrep, { intervalMs: PREP_REFRESH_MS });

  // Opening prep is a signal the recruiter sees ("Viewed prep materials"); the API records it at most hourly.
  useEffect(() => {
    void recordPrepViewed().catch(() => undefined);
  }, []);

  const subtitle = prep?.interview ? `Get ready for your ${prep.interview.title}` : prep ? `Stay ready for the ${prep.role} role` : undefined;

  return (
    <>
      <CandidateHeader title="Interview Prep" subtitle={subtitle} />
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex flex-col gap-5">
          {loading && <PrepSkeleton />}
          {!prep && error && (
            <LoadError title="AI preparation is temporarily unavailable." message="Please try again in a moment." onRetry={() => void refresh()} />
          )}
          {prep && (
            <>
              <InterviewSummary
                prep={prep}
                onConfirmed={(interview) => setData((current) => current && { ...current, interview })}
              />
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                {SECTIONS.map((section) => (
                  <PrepSection key={section.field} title={section.title} icon={section.icon} hint={section.hint} items={prep[section.field]} />
                ))}
              </div>
              <p className="flex items-start gap-2 text-xs leading-relaxed text-faint">
                <ShieldCheck aria-hidden className="mt-px size-3.5 shrink-0" />
                Prepared by AI from your application and the job posting. It never sees the hiring team’s internal notes or feedback.
              </p>
            </>
          )}
        </div>
        <AskAssistant className="xl:sticky xl:top-6" />
      </div>
    </>
  );
}

function InterviewSummary({ prep, onConfirmed }: { prep: CandidatePrep; onConfirmed: (interview: CandidateInterview) => void }) {
  const { me } = useCandidatePortal();
  const { confirm, pendingId } = useConfirmInterview(onConfirmed);
  const interview = prep.interview;

  if (!interview) {
    return (
      <Card className="p-5 sm:p-6">
        <p className="text-[13px] font-medium text-stone">Upcoming interview</p>
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-ink">No interview scheduled yet</h2>
        <p className="mt-1 text-sm text-stone">{prep.interviewFormat} In the meantime, here’s how to stay ready for the {prep.role} role.</p>
      </Card>
    );
  }

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] font-medium text-stone">Upcoming interview</p>
        <InterviewStatus interview={interview} />
      </div>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">{interview.title}</h2>
      <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-faint">Role</dt>
          <dd className="mt-0.5 text-charcoal">
            {prep.role} · {prep.company}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-faint">Date</dt>
          <dd className="mt-0.5 text-charcoal" suppressHydrationWarning>
            {formatDayLabel(interview.scheduledAt, { long: true })} · {formatTime(interview.scheduledAt)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-faint">Interview type</dt>
          <dd className="mt-0.5 text-charcoal">
            <InterviewFormat format={interview.format} /> · {formatDuration(interview.durationMinutes)}
          </dd>
        </div>
        {interview.interviewers.length > 0 && (
          <div>
            <dt className="text-xs text-faint">With</dt>
            <dd className="mt-0.5 text-charcoal">{interview.interviewers.join(", ")}</dd>
          </div>
        )}
      </dl>
      <div className="mt-5 flex flex-wrap gap-2">
        {interview.canConfirm && (
          <Button size="sm" onClick={() => void confirm(interview)} disabled={pendingId === interview.id}>
            {pendingId === interview.id ? <LoaderCircle className="animate-spin" /> : <CircleCheck />}
            Confirm interview
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={() => downloadInterviewIcs(interview, me.company)}>
          <CalendarPlus /> Add to calendar
        </Button>
      </div>
    </Card>
  );
}

function PrepSection({ title, icon: Icon, hint, items }: { title: string; icon: LucideIcon; hint?: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="flex items-center gap-2.5 font-semibold tracking-tight text-ink">
        <span className="flex size-8 items-center justify-center rounded-full bg-white/[0.05] ring-1 ring-white/[0.08]">
          <Icon aria-hidden className="size-4 text-charcoal" />
        </span>
        {title}
      </h2>
      {hint && <p className="mt-2 text-xs text-faint">{hint}</p>}
      <ul className="mt-4 flex flex-col gap-2.5 text-sm leading-relaxed text-charcoal">
        {items.map((item) => (
          <li key={item} className="flex gap-2.5">
            <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-ai" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function PrepSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Preparing your interview prep">
      <Skeleton className="h-[220px] rounded-[18px]" />
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-[200px] rounded-[18px]" />
        ))}
      </div>
    </div>
  );
}
