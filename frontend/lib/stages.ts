import type { ApplicationStage } from "@/types/application";
import type { EngagementLevel } from "@/types/event";
import type { InterviewStatus } from "@/types/interview";
import type { JobStatus } from "@/types/job";
import { PIPELINE_STAGES, type CandidateStage } from "@/types/workspace";

// Status presentation lives here so every badge, dot and bar uses the same colours.
// Colour is never the only signal: each style is paired with a text label (ARCHITECTURE.md 12.2).

export const STAGE_BADGE_STYLES: Record<ApplicationStage, string> = {
  sourced: "bg-amber-400/10 text-amber-200 ring-amber-300/20",
  applied: "bg-white/[0.06] text-charcoal ring-white/10",
  screening: "bg-blue-400/12 text-blue-200 ring-blue-300/20",
  interview: "bg-emerald-400/10 text-emerald-200 ring-emerald-300/20",
  final_interview: "bg-emerald-400/10 text-emerald-200 ring-emerald-300/20",
  offer: "bg-green-400/12 text-green-200 ring-green-300/25",
  hired: "bg-teal-400/10 text-teal-200 ring-teal-300/20",
  rejected: "bg-red-400/10 text-red-200 ring-red-300/20",
};

// Bars put stages side by side, so adjacent fills need clearly different hues.
export const STAGE_FILL_STYLES: Record<CandidateStage, string> = {
  sourced: "bg-amber-300/80",
  screening: "bg-blue-300/80",
  interview: "bg-emerald-400/85",
  offer: "bg-lime-300/85",
  hired: "bg-teal-200/70",
};

/** Steps shown in the candidate panel's progress bar. Hired means every step is complete. */
export const PROGRESS_STEPS = PIPELINE_STAGES.filter((stage) => stage !== "hired");

export function stageOrder(stage: CandidateStage): number {
  return PIPELINE_STAGES.indexOf(stage);
}

export const ENGAGEMENT_STYLES: Record<EngagementLevel, string> = {
  high: "text-emerald-300",
  medium: "text-blue-200",
  low: "text-amber-200",
  insufficient: "text-stone",
};

export const ENGAGEMENT_DESCRIPTIONS: Record<EngagementLevel, string> = {
  high: "Active this week",
  medium: "Some activity this week",
  low: "Quiet for over a week",
  insufficient: "Not enough activity yet",
};

export const JOB_STATUS: Record<JobStatus, { label: string; className: string }> = {
  open: { label: "Open", className: "bg-emerald-400/10 text-emerald-200 ring-emerald-300/20" },
  draft: { label: "Draft", className: "bg-white/[0.06] text-charcoal ring-white/10" },
  closed: { label: "Closed", className: "bg-white/[0.06] text-stone ring-white/10" },
};

export const INTERVIEW_STATUS: Record<InterviewStatus, { label: string; className: string }> = {
  scheduled: { label: "Awaiting confirmation", className: "bg-amber-400/10 text-amber-200 ring-amber-300/20" },
  confirmed: { label: "Confirmed", className: "bg-emerald-400/10 text-emerald-200 ring-emerald-300/20" },
  reschedule_requested: {
    label: "Reschedule requested",
    className: "bg-amber-400/10 text-amber-200 ring-amber-300/20",
  },
  completed: { label: "Completed", className: "bg-white/[0.06] text-charcoal ring-white/10" },
  canceled: { label: "Canceled", className: "bg-white/[0.06] text-stone ring-white/10" },
  no_show: { label: "No-show", className: "bg-red-400/10 text-red-200 ring-red-300/20" },
};
