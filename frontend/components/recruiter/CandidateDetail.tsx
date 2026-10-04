"use client";

import { Mail } from "lucide-react";
import { useState, type ReactNode } from "react";

import { CandidateAIPanel } from "@/components/ai/CandidateAIPanel";
import { CandidateActionsMenu } from "@/components/recruiter/CandidateActionsMenu";
import { CandidateActivity, CandidateActivitySkeleton } from "@/components/recruiter/CandidateActivity";
import { CandidateInterviewList } from "@/components/recruiter/CandidateInterviewList";
import { CandidateMessagesPreview } from "@/components/recruiter/CandidateMessagesPreview";
import { CandidateOverview } from "@/components/recruiter/CandidateOverview";
import { CandidatePipeline } from "@/components/recruiter/CandidatePipeline";
import { DetailError } from "@/components/recruiter/DetailError";
import { Avatar } from "@/components/shared/Avatar";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Tabs, TabsContent, TabsList } from "@/components/ui/Tabs";
import { useCandidateAI } from "@/hooks/useCandidateAI";
import { useCandidateDetail, type CandidateDetailState } from "@/hooks/useCandidateDetail";
import { DURATION, formatDate, isWithin } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CandidateDetail as Detail, PipelineCandidate } from "@/types/workspace";

const TABS = [
  { value: "overview", label: "Overview" },
  { value: "interviews", label: "Interviews" },
  { value: "messages", label: "Messages" },
  { value: "activity", label: "Activity" },
] as const;

type TabValue = (typeof TABS)[number]["value"];

/** panel: the dashboard's right column · sheet: the same, in a drawer below xl · page: the full profile. */
type Variant = "panel" | "sheet" | "page";

type CandidateDetailProps = {
  candidate: PipelineCandidate;
  variant?: Variant;
  /** Changing this focuses the AI prompt box. */
  aiFocusKey?: number;
  className?: string;
};

// Shared by the dashboard panel, the mobile sheet and /recruiter/candidates/[id] (ARCHITECTURE.md 12.1).
// The active tab and the loaded details survive switching candidates; the AI thread starts fresh.
export function CandidateDetail({ candidate, variant = "panel", aiFocusKey, className }: CandidateDetailProps) {
  const [tab, setTab] = useState<TabValue>("overview");
  const state = useCandidateDetail(candidate);
  return (
    <CandidateDetailBody
      key={candidate.id}
      candidate={candidate}
      variant={variant}
      tab={tab}
      onTabChange={setTab}
      state={state}
      aiFocusKey={aiFocusKey}
      className={className}
    />
  );
}

type BodyProps = Required<Pick<CandidateDetailProps, "candidate" | "variant">> &
  Pick<CandidateDetailProps, "aiFocusKey" | "className"> & {
    tab: TabValue;
    onTabChange: (tab: TabValue) => void;
    state: CandidateDetailState;
  };

function CandidateDetailBody({ candidate, variant, tab, onTabChange, state, aiFocusKey, className }: BodyProps) {
  const ai = useCandidateAI(candidate.id);
  const [focusKey, setFocusKey] = useState(0);
  const Heading = variant === "page" ? "h1" : "h2";
  const isPage = variant === "page";

  const header = (
    <div className={cn("animate-rise", variant === "sheet" && "pr-10")}>
      <div className="flex items-start gap-4">
        <Avatar
          name={candidate.name}
          src={candidate.avatarUrl}
          size={isPage ? 88 : 76}
          online={isWithin(candidate.lastActivityAt, 3 * DURATION.HOUR)}
        />
        <div className="min-w-0 flex-1 pt-1.5">
          <Heading className={cn("truncate font-semibold tracking-tight text-ink", isPage ? "text-[32px]" : "text-2xl")}>
            {candidate.name}
          </Heading>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[15px] text-stone">
            <span>{candidate.role}</span>
            {candidate.location && (
              <>
                <span aria-hidden>·</span>
                <span>{candidate.location}</span>
              </>
            )}
          </p>
          {isPage && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <StatusBadge stage={candidate.stage} />
              {candidate.email && (
                <a
                  href={`mailto:${candidate.email}`}
                  className="inline-flex h-7 items-center gap-1.5 rounded-[8px] px-2 text-sm text-charcoal transition-colors hover:bg-white/[0.06] hover:text-ink"
                >
                  <Mail aria-hidden className="size-4 text-stone" /> {candidate.email}
                </a>
              )}
              <span className="text-sm text-faint" suppressHydrationWarning>
                Added {formatDate(candidate.addedAt)}
              </span>
            </div>
          )}
        </div>
        <CandidateActionsMenu
          candidate={candidate}
          onAskAI={() => setFocusKey((key) => key + 1)}
          className="size-10 rounded-[12px] bg-white/[0.05] ring-1 ring-white/[0.08]"
        />
      </div>
      {isPage && candidate.skills.length > 0 && (
        <ul aria-label="Skills" className="mt-5 flex flex-wrap gap-2">
          {candidate.skills.map((skill) => (
            <li key={skill} className="rounded-full bg-white/[0.05] px-3 py-1 text-[13px] text-charcoal ring-1 ring-white/[0.07]">
              {skill}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-7">
        <CandidatePipeline stage={candidate.stage} />
      </div>
    </div>
  );

  const tabs = (
    <Tabs value={tab} onValueChange={(value) => onTabChange(value as TabValue)} className="flex min-h-0 flex-1 flex-col">
      <TabsList tabs={[...TABS]} value={tab} label="Candidate sections" className="mx-5 mt-6 sm:mx-6" />
      <div className={cn("px-5 pt-5 pb-5 sm:px-6", variant === "panel" && "min-h-0 flex-1 overflow-y-auto")}>
        <TabsContent value="overview">
          <CandidateOverview
            candidate={candidate}
            state={state}
            onViewAll={() => onTabChange("activity")}
            onDraftFollowUp={() => void ai.send("Draft follow-up message")}
            aiPending={ai.pending}
          />
        </TabsContent>
        <TabsContent value="interviews">
          <WithDetail state={state}>{(detail) => <CandidateInterviewList candidate={candidate} interviews={detail.interviews} />}</WithDetail>
        </TabsContent>
        <TabsContent value="messages">
          <WithDetail state={state}>{(detail) => <CandidateMessagesPreview candidate={candidate} messages={detail.messages} />}</WithDetail>
        </TabsContent>
        <TabsContent value="activity">
          <WithDetail state={state}>{(detail) => <CandidateActivity activities={detail.activities} timeline />}</WithDetail>
        </TabsContent>
      </div>
    </Tabs>
  );

  // Both counters only grow while this candidate is shown, so their sum changes on every request.
  const aiPanel = <CandidateAIPanel candidate={candidate} ai={ai} focusKey={(aiFocusKey ?? 0) + focusKey} />;

  if (isPage) {
    return (
      <div className={cn("grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px]", className)}>
        <section aria-label="Candidate details" className="glass flex flex-col rounded-[22px] border border-border pt-6 sm:pt-7">
          <div className="px-5 sm:px-7">{header}</div>
          {tabs}
        </section>
        <div className="flex flex-col gap-4 lg:sticky lg:top-6">{aiPanel}</div>
      </div>
    );
  }

  return (
    <section
      aria-label={`${candidate.name}, candidate details`}
      className={cn(
        "flex flex-col",
        variant === "panel" && "glass rounded-[22px] border border-border xl:max-h-[calc(100dvh-3rem)]",
        className,
      )}
    >
      <div className="shrink-0 px-5 pt-6 sm:px-6">{header}</div>
      {tabs}
      <div className="shrink-0 px-3 pb-3 sm:px-4 sm:pb-4">{aiPanel}</div>
    </section>
  );
}

function WithDetail({ state, children }: { state: CandidateDetailState; children: (detail: Detail) => ReactNode }) {
  if (state.detail) return children(state.detail);
  if (state.error) return <DetailError message={state.error} onRetry={state.retry} />;
  return <CandidateActivitySkeleton rows={4} />;
}
