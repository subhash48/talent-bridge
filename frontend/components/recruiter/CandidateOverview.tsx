import { ArrowRight, CalendarClock, Link2, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { CandidateActivity, CandidateActivitySkeleton } from "@/components/recruiter/CandidateActivity";
import { DetailError } from "@/components/recruiter/DetailError";
import { CommunicationCard } from "@/components/recruiter/communication/CommunicationCard";
import type { CandidateDetailState } from "@/hooks/useCandidateDetail";
import { formatSchedule } from "@/lib/format";
import type { PipelineCandidate } from "@/types/workspace";

type CandidateOverviewProps = {
  candidate: PipelineCandidate;
  state: CandidateDetailState;
  onViewAll: () => void;
};

export function CandidateOverview({ candidate, state, onViewAll }: CandidateOverviewProps) {
  return (
    <div className="@container flex flex-col gap-5">
      <CommunicationCard candidate={candidate} health={state.detail?.communication} loading={state.loading} />

      {/* Side by side when the panel is wide enough to show "Design interview" in full. */}
      <div className="grid grid-cols-1 gap-3 @[25rem]:grid-cols-2">
        <StatCard
          icon={CalendarClock}
          label="Next step"
          value={candidate.nextStep?.title ?? "Nothing scheduled"}
          hint={<span suppressHydrationWarning>{candidate.nextStep ? formatSchedule(candidate.nextStep.date) : "Plan the next touchpoint"}</span>}
        />
        <StatCard
          icon={Link2}
          label="Source"
          value={candidate.source || (candidate.origin === "ashby" ? "Ashby" : "Talent Bridge")}
          hint={
            candidate.origin === "ashby"
              ? state.detail?.ashby?.stageTitle
                ? `Ashby stage: ${state.detail.ashby.stageTitle}`
                : "Synced from Ashby"
              : "Added in Talent Bridge"
          }
        />
      </div>

      <section aria-label="Recent activity">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-[15px] font-medium tracking-tight text-ink">Recent activity</h3>
          <button
            type="button"
            onClick={onViewAll}
            className="inline-flex items-center gap-1.5 rounded-sm text-sm text-charcoal transition-colors hover:text-ink"
          >
            View all <ArrowRight aria-hidden className="size-4" />
          </button>
        </div>
        <div className="mt-1">
          {state.detail ? (
            <CandidateActivity activities={state.detail.activities.slice(0, 3)} />
          ) : state.error ? (
            <DetailError message={state.error} onRetry={state.retry} />
          ) : (
            <CandidateActivitySkeleton />
          )}
        </div>
      </section>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, hint }: { icon: LucideIcon; label: string; value: string; hint: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-[10px] border border-border bg-ink/[0.03] p-3.5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[8px] bg-ink/[0.05] ring-1 ring-ink/10">
        <Icon aria-hidden strokeWidth={1.75} className="size-4 text-charcoal" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-stone">{label}</p>
        <p className="line-clamp-2 text-sm leading-tight font-medium tracking-tight text-ink">{value}</p>
        <p className="mt-0.5 text-xs text-stone">{hint}</p>
      </div>
    </div>
  );
}
