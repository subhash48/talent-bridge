import { cn } from "@/lib/utils";
import type { CommunicationStatus } from "@/types/communication";

const STATUS: Record<CommunicationStatus, { label: string; className: string; dot: string }> = {
  needs_attention: { label: "Needs update", className: "bg-caution/[0.1] text-caution ring-caution/25", dot: "bg-caution" },
  due_soon: { label: "Due soon", className: "bg-ink/[0.05] text-charcoal ring-ink/15", dot: "bg-caution/70" },
  on_track: { label: "On track", className: "bg-sage/[0.08] text-sage ring-sage/20", dot: "bg-sage" },
  closed: { label: "Closed", className: "bg-ink/[0.04] text-stone ring-ink/10", dot: "bg-faint" },
};

export const COMMUNICATION_LABELS: Record<CommunicationStatus, string> = Object.fromEntries(
  Object.entries(STATUS).map(([key, value]) => [key, value.label]),
) as Record<CommunicationStatus, string>;

/** Whether the candidate is hearing from us on time. Never a judgement of the candidate. */
export function CommunicationBadge({ status, className }: { status: CommunicationStatus; className?: string }) {
  const { label, className: tone, dot } = STATUS[status];
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap ring-1",
        tone,
        className,
      )}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", dot)} />
      {label}
    </span>
  );
}
