import { StatusBadge } from "@/components/shared/StatusBadge";
import { cn } from "@/lib/utils";
import type { ApiStage } from "@/types/api";
import type { ApplicationStatus } from "@/types/portal";

// An application's status as the candidate sees it: its stage while active, and a calm, neutral
// label once it has closed ("No longer under consideration" is never shown in alarm red).
export function PortalStatusBadge({
  stage,
  status,
  label,
  className,
}: {
  stage: ApiStage;
  status: ApplicationStatus;
  label: string;
  className?: string;
}) {
  if (status === "active" || stage === "hired") return <StatusBadge stage={stage} label={label} className={className} />;
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center justify-center rounded-[6px] bg-ink/[0.05] px-2 text-xs font-medium whitespace-nowrap text-stone ring-1 ring-ink/10 ring-inset",
        className,
      )}
    >
      {label}
    </span>
  );
}
