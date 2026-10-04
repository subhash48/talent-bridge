import { cn } from "@/lib/utils";
import type { DemoPostingStatus } from "@/types/demo";

// The posting's status on the demo careers site. The job's own status in the ATS is JobStatusBadge's.
const STATUS: Record<DemoPostingStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-white/[0.06] text-charcoal ring-white/10" },
  published: { label: "Published", className: "bg-emerald-400/10 text-emerald-200 ring-emerald-300/20" },
  closed: { label: "Closed", className: "bg-white/[0.06] text-stone ring-white/10" },
};

export function DemoJobStatusBadge({ status, className }: { status: DemoPostingStatus; className?: string }) {
  const { label, className: tone } = STATUS[status];
  return (
    <span className={cn("inline-flex h-6 w-fit shrink-0 items-center rounded-[7px] px-2 text-xs font-medium ring-1 ring-inset", tone, className)}>
      {label}
    </span>
  );
}
