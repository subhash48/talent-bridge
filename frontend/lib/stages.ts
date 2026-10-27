import type { ApplicationStage } from "@/types/application";
import type { InterviewStatus } from "@/types/interview";
import type { JobStatus } from "@/types/job";
import { PIPELINE_STAGES, type CandidateStage } from "@/types/workspace";

// Status presentation lives here so every badge, dot and bar uses the same colours.
// Colour is never the only signal: each style is paired with a text label (ARCHITECTURE.md 12.2).
//
// A pipeline reads as neutral early on and teal-sage once a candidate is interviewing, growing
// stronger stage by stage. Sage marks an offer or a hire, danger a rejection; amber marks a wait.

export const STAGE_BADGE_STYLES: Record<ApplicationStage, string> = {
  sourced: "bg-ink/[0.03] text-stone ring-ink/10",
  applied: "bg-ink/[0.05] text-charcoal ring-ink/10",
  screening: "bg-ink/[0.07] text-charcoal ring-ink/[0.16]",
  interview: "bg-accent-soft text-brand-ink ring-brand-ink/20",
  final_interview: "bg-accent/55 text-ink ring-brand-ink/30",
  offer: "bg-sage/[0.08] text-sage ring-sage/20",
  hired: "bg-sage/[0.12] text-sage ring-sage/30",
  rejected: "bg-danger/[0.08] text-danger ring-danger/20",
};

// Bars put stages side by side, so adjacent fills step clearly in strength.
export const STAGE_FILL_STYLES: Record<CandidateStage, string> = {
  sourced: "bg-ink/[0.14]",
  screening: "bg-brand/55",
  interview: "bg-brand",
  offer: "bg-brand-ink",
  hired: "bg-sage",
};

/** Steps shown in the candidate panel's progress bar. Hired means every step is complete. */
export const PROGRESS_STEPS = PIPELINE_STAGES.filter((stage) => stage !== "hired");

export function stageOrder(stage: CandidateStage): number {
  return PIPELINE_STAGES.indexOf(stage);
}

export const JOB_STATUS: Record<JobStatus, { label: string; className: string }> = {
  open: { label: "Open", className: "bg-sage/[0.08] text-sage ring-sage/20" },
  draft: { label: "Draft", className: "bg-ink/[0.06] text-charcoal ring-ink/10" },
  closed: { label: "Closed", className: "bg-ink/[0.04] text-stone ring-ink/10" },
};

export const INTERVIEW_STATUS: Record<InterviewStatus, { label: string; className: string }> = {
  scheduled: { label: "Awaiting confirmation", className: "bg-caution/10 text-caution ring-caution/30" },
  confirmed: { label: "Confirmed", className: "bg-sage/[0.08] text-sage ring-sage/20" },
  reschedule_requested: {
    label: "Reschedule requested",
    className: "bg-caution/10 text-caution ring-caution/30",
  },
  completed: { label: "Completed", className: "bg-ink/[0.06] text-charcoal ring-ink/10" },
  canceled: { label: "Canceled", className: "bg-ink/[0.04] text-stone ring-ink/10" },
  no_show: { label: "No-show", className: "bg-danger/[0.08] text-danger ring-danger/20" },
};
