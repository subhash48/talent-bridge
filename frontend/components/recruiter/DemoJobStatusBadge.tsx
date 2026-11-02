import { cn } from "@/lib/utils";
import type { DemoPostingStatus } from "@/types/demo";

// The posting's status on the demo careers site. The job's own status in the ATS is JobStatusBadge's.
const STATUS: Record<DemoPostingStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-ink/[0.06] text-charcoal ring-ink/10" },
  published: { label: "Published", className: "bg-success/10 text-success ring-success/20" },
  closed: { label: "Closed", className: "bg-ink/[0.06] text-stone ring-ink/10" },
};

export function DemoJobStatusBadge({ status, className }: { status: DemoPostingStatus; className?: string }) {
  const { label, className: tone } = STATUS[status];
  return (
    <span className={cn("inline-flex h-6 w-fit shrink-0 items-center rounded-full px-2.5 text-xs font-medium ring-1 ring-inset", tone, className)}>
      {label}
    </span>
  );
}
