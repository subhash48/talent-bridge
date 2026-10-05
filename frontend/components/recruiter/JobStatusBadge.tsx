import { JOB_STATUS } from "@/lib/stages";
import { cn } from "@/lib/utils";
import type { JobStatus } from "@/types/job";

export function JobStatusBadge({ status, className }: { status: JobStatus; className?: string }) {
  const { label, className: tone } = JOB_STATUS[status];
  return (
    <span className={cn("inline-flex h-6 w-fit shrink-0 items-center rounded-[6px] px-2 text-xs font-medium ring-1 ring-inset", tone, className)}>
      {label}
    </span>
  );
}
