import { cn } from "@/lib/utils";
import type { CandidateInterview } from "@/types/portal";

const STYLES = {
  confirmed: { label: "Confirmed", className: "bg-emerald-400/10 text-emerald-200 ring-emerald-300/20" },
  confirm: { label: "Needs confirmation", className: "bg-amber-400/10 text-amber-200 ring-amber-300/20" },
  now: { label: "Happening now", className: "bg-ai/15 text-violet-100 ring-ai/30" },
  completed: { label: "Completed", className: "bg-white/[0.06] text-charcoal ring-white/10" },
  cancelled: { label: "Cancelled", className: "bg-white/[0.06] text-stone ring-white/10" },
} as const;

export function interviewState(interview: CandidateInterview): keyof typeof STYLES {
  if (interview.status === "cancelled") return "cancelled";
  if (!interview.upcoming) return "completed";
  if (interview.confirmedAt) return "confirmed";
  return interview.canConfirm ? "confirm" : "now";
}

/** Colour is paired with a label, never the only signal. */
export function InterviewStatus({ interview, className }: { interview: CandidateInterview; className?: string }) {
  const style = STYLES[interviewState(interview)];
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center rounded-[7px] px-2 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        style.className,
        className,
      )}
    >
      {style.label}
    </span>
  );
}
