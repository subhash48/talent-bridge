import { ArrowRight, CalendarClock, ChartNoAxesColumnIncreasing, CircleAlert, Sparkles, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { CandidateActivity, CandidateActivitySkeleton } from "@/components/recruiter/CandidateActivity";
import { Button } from "@/components/ui/Button";
import type { CandidateDetailState } from "@/hooks/useCandidateDetail";
import { formatSchedule } from "@/lib/format";
import { ENGAGEMENT_DESCRIPTIONS } from "@/lib/stages";
import { ENGAGEMENT_LABELS } from "@/types/event";
import type { PipelineCandidate } from "@/types/workspace";

type CandidateOverviewProps = {
  candidate: PipelineCandidate;
  state: CandidateDetailState;
  onViewAll: () => void;
  onDraftFollowUp: () => void;
  aiPending: boolean;
};

export function CandidateOverview({ candidate, state, onViewAll, onDraftFollowUp, aiPending }: CandidateOverviewProps) {
  return (
    <div className="@container flex flex-col gap-6">
      {candidate.followUp && (
        <div className="flex flex-col gap-3 rounded-[14px] border border-amber-300/20 bg-amber-300/[0.06] p-3.5 sm:flex-row sm:items-center">
          <p className="flex flex-1 items-start gap-2.5 text-sm text-amber-100">
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-amber-300" />
            <span>
              <span className="font-medium">Needs follow-up.</span> {candidate.followUp.reason}.
            </span>
          </p>
          <Button variant="ai" size="sm" onClick={onDraftFollowUp} disabled={aiPending} className="self-start sm:self-auto">
            <Sparkles /> Draft follow-up
          </Button>
        </div>
      )}

      {/* Side by side when the panel is wide enough to show "Design interview" in full. */}
      <div className="grid grid-cols-1 gap-3 @[25rem]:grid-cols-2">
        <StatCard
          icon={ChartNoAxesColumnIncreasing}
          label="Engagement"
          value={ENGAGEMENT_LABELS[candidate.engagement]}
          hint={ENGAGEMENT_DESCRIPTIONS[candidate.engagement]}
        />
        <StatCard
          icon={CalendarClock}
          label="Next step"
          value={candidate.nextStep?.title ?? "Nothing scheduled"}
          hint={<span suppressHydrationWarning>{candidate.nextStep ? formatSchedule(candidate.nextStep.date) : "Plan the next touchpoint"}</span>}
        />
      </div>

      <section aria-label="Recent activity">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-[17px] font-medium tracking-tight text-ink">Recent activity</h3>
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
    <div className="flex items-center gap-3 rounded-[14px] bg-white/[0.04] p-3 ring-1 ring-white/[0.07]">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-white/[0.06] ring-1 ring-white/[0.08]">
        <Icon aria-hidden strokeWidth={2} className="size-5 text-ink" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-stone">{label}</p>
        <p className="line-clamp-2 text-[15px] leading-tight font-semibold tracking-tight text-ink">{value}</p>
        <p className="mt-0.5 text-xs text-stone">{hint}</p>
      </div>
    </div>
  );
}

export function DetailError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[12px] border border-red-400/20 bg-red-400/[0.06] px-3.5 py-3 text-sm text-red-100">
      <span>{message}</span>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
