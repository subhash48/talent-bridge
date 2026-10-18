"use client";

import { Mail, Phone } from "lucide-react";
import { useState, type ReactNode } from "react";

import { CandidateActionsMenu } from "@/components/recruiter/CandidateActionsMenu";
import { CandidateActivity, CandidateActivitySkeleton } from "@/components/recruiter/CandidateActivity";
import { CandidateInterviewList } from "@/components/recruiter/CandidateInterviewList";
import { CandidateMessagesPreview } from "@/components/recruiter/CandidateMessagesPreview";
import { CandidateOverview } from "@/components/recruiter/CandidateOverview";
import { CandidatePipeline } from "@/components/recruiter/CandidatePipeline";
import { DetailError } from "@/components/recruiter/DetailError";
import { ResumeLink } from "@/components/recruiter/ResumeLink";
import { Avatar } from "@/components/shared/Avatar";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Tabs, TabsContent, TabsList } from "@/components/ui/Tabs";
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

// Email, phone and résumé in the full profile's header.
const CONTACT_LINK =
  "inline-flex h-7 items-center gap-1.5 rounded-[6px] px-2 text-sm text-charcoal transition-colors hover:bg-ink/[0.06] hover:text-ink";

/** panel: the dashboard's right column · sheet: the same, in a drawer below xl · page: the full profile. */
type Variant = "panel" | "sheet" | "page";

type CandidateDetailProps = {
  candidate: PipelineCandidate;
  variant?: Variant;
  className?: string;
};

// Shared by the dashboard panel, the mobile sheet and /recruiter/candidates/[id] (ARCHITECTURE.md 12.1).
// The active tab and the loaded details survive switching candidates.
export function CandidateDetail({ candidate, variant = "panel", className }: CandidateDetailProps) {
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
      className={className}
    />
  );
}

type BodyProps = Required<Pick<CandidateDetailProps, "candidate" | "variant">> &
  Pick<CandidateDetailProps, "className"> & {
    tab: TabValue;
    onTabChange: (tab: TabValue) => void;
    state: CandidateDetailState;
  };

function CandidateDetailBody({ candidate, variant, tab, onTabChange, state, className }: BodyProps) {
  const Heading = variant === "page" ? "h1" : "h2";
  const isPage = variant === "page";

  const header = (
    <div className={cn("animate-rise", variant === "sheet" && "pr-10")}>
      <div className="flex items-start gap-3.5">
        <Avatar
          name={candidate.name}
          src={candidate.avatarUrl}
          size={isPage ? 64 : 56}
          online={isWithin(candidate.lastActivityAt, 3 * DURATION.HOUR)}
        />
        <div className="min-w-0 flex-1 pt-1">
          <Heading className={cn("truncate leading-tight font-semibold tracking-[-0.02em] text-ink", isPage ? "text-xl sm:text-2xl" : "text-xl")}>
            {candidate.name}
          </Heading>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-stone">
            <span>{candidate.role}</span>
            {candidate.location && (
              <>
                <span aria-hidden>·</span>
                <span>{candidate.location}</span>
              </>
            )}
          </p>
          {isPage && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <StatusBadge stage={candidate.stage} />
              {candidate.email && (
                <a href={`mailto:${candidate.email}`} className={CONTACT_LINK}>
                  <Mail aria-hidden className="size-4 text-stone" /> {candidate.email}
                </a>
              )}
              {candidate.phone && (
                <a href={`tel:${candidate.phone.replace(/[^\d+]/g, "")}`} className={CONTACT_LINK}>
                  <Phone aria-hidden className="size-4 text-stone" /> {candidate.phone}
                </a>
              )}
              {candidate.resumeUrl && <ResumeLink url={candidate.resumeUrl} candidateName={candidate.name} className={CONTACT_LINK} />}
              <span className="text-sm text-faint" suppressHydrationWarning>
                Added {formatDate(candidate.addedAt)}
              </span>
            </div>
          )}
        </div>
        <CandidateActionsMenu
          candidate={candidate}
          className="size-9 rounded-[8px] bg-ink/[0.05] ring-1 ring-ink/10 [&_svg]:size-4"
        />
      </div>
      {isPage && candidate.skills.length > 0 && (
        <ul aria-label="Skills" className="mt-4 flex flex-wrap gap-1.5">
          {candidate.skills.map((skill) => (
            <li key={skill} className="inline-flex h-6 items-center rounded-full bg-ink/[0.05] px-2.5 text-xs text-charcoal ring-1 ring-ink/10">
              {skill}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-5">
        <CandidatePipeline stage={candidate.stage} />
      </div>
    </div>
  );

  const tabs = (
    <Tabs value={tab} onValueChange={(value) => onTabChange(value as TabValue)} className="flex min-h-0 flex-1 flex-col">
      <TabsList tabs={[...TABS]} value={tab} label="Candidate sections" className="mx-5 mt-5 sm:mx-5" />
      <div className={cn("px-5 pt-4 pb-5 sm:px-5", variant === "panel" && "min-h-0 flex-1 overflow-y-auto")}>
        <TabsContent value="overview">
          <CandidateOverview
            candidate={candidate}
            state={state}
            onViewAll={() => onTabChange("activity")}
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

  if (isPage) {
    return (
      <section aria-label="Candidate details" className={cn("glass flex flex-col rounded-[16px] border border-border pt-5 sm:pt-5", className)}>
        <div className="px-5 sm:px-5">{header}</div>
        {tabs}
      </section>
    );
  }

  return (
    <section
      aria-label={`${candidate.name}, candidate details`}
      className={cn(
        "flex flex-col",
        variant === "panel" && "glass rounded-[16px] border border-border xl:max-h-[calc(100dvh-3rem)]",
        className,
      )}
    >
      <div className="shrink-0 px-5 pt-5 sm:px-5">{header}</div>
      {tabs}
    </section>
  );
}

function WithDetail({ state, children }: { state: CandidateDetailState; children: (detail: Detail) => ReactNode }) {
  if (state.detail) return children(state.detail);
  if (state.error) return <DetailError message={state.error} onRetry={state.retry} />;
  return <CandidateActivitySkeleton rows={4} />;
}
