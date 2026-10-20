"use client";

import {
  BookOpenCheck,
  Building2,
  CalendarPlus,
  CircleCheck,
  Compass,
  FileText,
  Lightbulb,
  LoaderCircle,
  MessageCircleQuestion,
  ShieldCheck,
  Target,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect } from "react";

import { AskAssistant } from "@/components/candidate/AskAssistant";
import { useCandidatePortal } from "@/components/candidate/CandidatePortalProvider";
import { CandidateHeader } from "@/components/candidate/CandidateHeader";
import { InterviewStatus } from "@/components/candidate/InterviewStatus";
import { LoadError } from "@/components/candidate/LoadError";
import { MockInterview } from "@/components/candidate/MockInterview";
import { InterviewFormat } from "@/components/shared/InterviewFormat";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { useConfirmInterview } from "@/hooks/useConfirmInterview";
import { useLiveQuery } from "@/hooks/useLiveQuery";
import { downloadInterviewIcs } from "@/lib/calendar";
import { formatDayLabel, formatDuration, formatTime } from "@/lib/format";
import { getCandidatePrep } from "@/services/portal";
import type { CandidateInterview, CandidatePrep } from "@/types/portal";

const PREP_REFRESH_MS = 5 * 60_000;

type PrepList =
  | "whatToExpect"
  | "roleFocus"
  | "resumeTalkingPoints"
  | "topicsToReview"
  | "companyInfo"
  | "questionsToAsk"
  | "practiceQuestions";

const SECTIONS: { field: PrepList; title: string; icon: LucideIcon; hint?: string }[] = [
  { field: "whatToExpect", title: "What to expect", icon: Compass },
  { field: "roleFocus", title: "Role focus", icon: Target },
  { field: "resumeTalkingPoints", title: "From your résumé", icon: FileText, hint: "Stories worth having ready" },
  { field: "topicsToReview", title: "Suggested topics to review", icon: BookOpenCheck },
  { field: "companyInfo", title: "About the company", icon: Building2, hint: "Company-approved information" },
  { field: "questionsToAsk", title: "Questions you may want to ask", icon: MessageCircleQuestion },
  { field: "practiceQuestions", title: "Practice questions", icon: Lightbulb },
];

/**
 * Prep for the application the portal is showing, or for one interview (/candidate/prep?interview=...).
 * An interview decides the application: opening one makes its application the portal's context.
 */
export function InterviewPrep({ interviewId }: { interviewId?: string }) {
  const { applicationId } = useCandidatePortal();
  // Keyed by the interview when there is one, so the selection following it doesn't restart the prep.
  return (
    <PrepView key={interviewId ? `interview:${interviewId}` : (applicationId ?? "none")} applicationId={applicationId} interviewId={interviewId ?? null} />
  );
}

function PrepView({ applicationId, interviewId }: { applicationId: string | null; interviewId: string | null }) {
  const { selectApplication } = useCandidatePortal();
  // With an interview, the API ignores the selected application, so the request doesn't depend on it.
  const requestedApplication = interviewId ? null : applicationId;
  const loadPrep = useCallback(
    () => getCandidatePrep(requestedApplication, { interviewId }),
    [requestedApplication, interviewId],
  );
  const { data: prep, error, loading, refresh, setData } = useLiveQuery(loadPrep, { intervalMs: PREP_REFRESH_MS });

  // The whole portal follows the application this prep is for (the opened interview's).
  const preparedFor = prep?.applicationId;
  useEffect(() => {
    if (preparedFor) selectApplication(preparedFor);
  }, [preparedFor, selectApplication]);

  const subtitle = prep?.interview
    ? `${prep.interview.title} · ${prep.role} at ${prep.company}`
    : prep
      ? `Stay ready for the ${prep.role} role at ${prep.company}`
      : undefined;

  return (
    <>
      <CandidateHeader title="Interview Prep" subtitle={subtitle} />
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-4">
          {loading && <PrepSkeleton />}
          {!prep && error && interviewId && <LoadError title="This interview couldn't be opened." message={error} onRetry={() => void refresh()} />}
          {!prep && error && !interviewId && (
            <LoadError title="AI preparation is temporarily unavailable." message="Please try again in a moment." onRetry={() => void refresh()} />
          )}
          {prep && (
            <>
              <InterviewSummary
                prep={prep}
                onConfirmed={(interview) => setData((current) => current && { ...current, interview })}
              />
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {SECTIONS.filter((section) => prep[section.field].length > 0).map((section) => (
                  <PrepSection key={section.field} title={section.title} icon={section.icon} hint={section.hint} items={prep[section.field]} />
                ))}
              </div>
              <MockInterview questions={prep.practiceQuestions} applicationId={prep.applicationId} interviewId={interviewId} />
              <p className="flex items-start gap-2 text-xs leading-relaxed text-faint">
                <ShieldCheck aria-hidden className="mt-px size-3.5 shrink-0" />
                Prepared by AI from your application, your résumé and the job posting. It never sees the hiring team’s internal notes or feedback.
              </p>
            </>
          )}
        </div>
        {/* A conversation is about one application: a new one when the application changes. */}
        <AskAssistant key={applicationId ?? "none"} className="xl:sticky xl:top-6" />
      </div>
    </>
  );
}

function InterviewSummary({ prep, onConfirmed }: { prep: CandidatePrep; onConfirmed: (interview: CandidateInterview) => void }) {
  const { confirm, pendingId } = useConfirmInterview(onConfirmed);
  const interview = prep.interview;

  if (!interview) {
    return (
      <Card className="p-5 sm:p-5">
        <p className="text-xs font-medium text-stone">Upcoming interview</p>
        <h2 className="mt-2 text-lg font-semibold tracking-tight text-ink">No interview scheduled yet</h2>
        <p className="mt-1 text-sm text-stone">{prep.interviewFormat} In the meantime, here’s how to stay ready for the {prep.role} role.</p>
      </Card>
    );
  }

  return (
    <Card className="p-5 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-medium text-stone">{interview.upcoming ? "Upcoming interview" : "Interview"}</p>
        <InterviewStatus interview={interview} />
      </div>
      <h2 className="mt-2 text-xl font-semibold tracking-tight text-ink sm:text-2xl">{interview.title}</h2>
      <dl className="mt-4 grid grid-cols-1 gap-x-5 gap-y-3 text-sm sm:grid-cols-2">
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
      <div className="mt-4 flex flex-wrap gap-2">
        {interview.canConfirm && (
          <Button size="sm" onClick={() => void confirm(interview)} disabled={pendingId === interview.id}>
            {pendingId === interview.id ? <LoaderCircle className="animate-spin" /> : <CircleCheck />}
            Confirm interview
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={() => downloadInterviewIcs(interview, prep.company)}>
          <CalendarPlus /> Add to calendar
        </Button>
      </div>
    </Card>
  );
}

function PrepSection({ title, icon: Icon, hint, items }: { title: string; icon: LucideIcon; hint?: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <Card className="p-5 sm:p-5">
      <h2 className="flex items-center gap-2.5 text-base font-semibold tracking-tight text-ink">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ink/[0.05] ring-1 ring-ink/10">
          <Icon aria-hidden className="size-4 text-charcoal" />
        </span>
        {title}
      </h2>
      {hint && <p className="mt-2 text-xs text-faint">{hint}</p>}
      <ul className="mt-3 flex flex-col gap-2.5 text-sm leading-relaxed text-charcoal">
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
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Preparing your interview prep">
      <Skeleton className="h-[200px] rounded-[14px]" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-[180px] rounded-[14px]" />
        ))}
      </div>
    </div>
  );
}
