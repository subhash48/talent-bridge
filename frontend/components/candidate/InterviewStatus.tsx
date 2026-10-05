import { cn } from "@/lib/utils";
import type { CandidateInterview } from "@/types/portal";

const STYLES = {
  confirmed: { label: "Confirmed", className: "bg-sage/10 text-sage ring-sage/20" },
  confirm: { label: "Needs confirmation", className: "bg-caution/10 text-caution ring-caution/20" },
  now: { label: "Happening now", className: "bg-ink/[0.12] text-ink ring-ink/25" },
  completed: { label: "Completed", className: "bg-ink/[0.06] text-charcoal ring-ink/10" },
  cancelled: { label: "Cancelled", className: "bg-ink/[0.04] text-stone ring-ink/10" },
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
        "inline-flex h-6 shrink-0 items-center rounded-[6px] px-2 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        style.className,
        className,
      )}
    >
      {style.label}
    </span>
  );
}
