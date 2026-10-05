import type { ApplicationStage } from "@/types/application";
import type { EngagementLevel } from "@/types/event";
import type { InterviewStatus } from "@/types/interview";
import type { JobStatus } from "@/types/job";
import { PIPELINE_STAGES, type CandidateStage } from "@/types/workspace";

// Status presentation lives here so every badge, dot and bar uses the same colours.
// Colour is never the only signal: each style is paired with a text label (ARCHITECTURE.md 12.2).
//
// A pipeline reads as ivory growing stronger stage by stage. Colour is kept for the ends that mean
// something: sage for an offer or a hire, danger for a rejection.

export const STAGE_BADGE_STYLES: Record<ApplicationStage, string> = {
  sourced: "bg-ink/[0.03] text-stone ring-ink/10",
  applied: "bg-ink/[0.05] text-charcoal ring-ink/10",
  screening: "bg-ink/[0.07] text-charcoal ring-ink/[0.16]",
  interview: "bg-ink/[0.12] text-ink ring-ink/25",
  final_interview: "bg-ink/[0.16] text-ink ring-ink/30",
  offer: "bg-sage/10 text-sage ring-sage/20",
  hired: "bg-sage/[0.16] text-sage ring-sage/30",
  rejected: "bg-danger/10 text-danger ring-danger/20",
};

// Bars put stages side by side, so adjacent fills step clearly in strength.
export const STAGE_FILL_STYLES: Record<CandidateStage, string> = {
  sourced: "bg-ink/20",
  screening: "bg-ink/40",
  interview: "bg-ink/65",
  offer: "bg-ink/90",
  hired: "bg-sage/85",
};

/** Steps shown in the candidate panel's progress bar. Hired means every step is complete. */
export const PROGRESS_STEPS = PIPELINE_STAGES.filter((stage) => stage !== "hired");

export function stageOrder(stage: CandidateStage): number {
  return PIPELINE_STAGES.indexOf(stage);
}

export const ENGAGEMENT_STYLES: Record<EngagementLevel, string> = {
  high: "text-sage",
  medium: "text-ink",
  low: "text-caution",
  insufficient: "text-stone",
};

export const JOB_STATUS: Record<JobStatus, { label: string; className: string }> = {
  open: { label: "Open", className: "bg-sage/10 text-sage ring-sage/20" },
  draft: { label: "Draft", className: "bg-ink/[0.06] text-charcoal ring-ink/10" },
  closed: { label: "Closed", className: "bg-ink/[0.04] text-stone ring-ink/10" },
};

export const INTERVIEW_STATUS: Record<InterviewStatus, { label: string; className: string }> = {
  scheduled: { label: "Awaiting confirmation", className: "bg-caution/10 text-caution ring-caution/20" },
  confirmed: { label: "Confirmed", className: "bg-sage/10 text-sage ring-sage/20" },
  reschedule_requested: {
    label: "Reschedule requested",
    className: "bg-caution/10 text-caution ring-caution/20",
  },
  completed: { label: "Completed", className: "bg-ink/[0.06] text-charcoal ring-ink/10" },
  canceled: { label: "Canceled", className: "bg-ink/[0.04] text-stone ring-ink/10" },
  no_show: { label: "No-show", className: "bg-danger/10 text-danger ring-danger/20" },
};
