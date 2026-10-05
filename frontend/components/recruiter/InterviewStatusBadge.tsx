import { INTERVIEW_STATUS } from "@/lib/stages";
import { cn } from "@/lib/utils";
import type { ScheduledInterview } from "@/types/workspace";

const FEEDBACK_PENDING = { label: "Feedback pending", className: "bg-caution/10 text-caution ring-caution/20" };

export function InterviewStatusBadge({ interview, className }: { interview: ScheduledInterview; className?: string }) {
  const status = interview.feedback === "pending" ? FEEDBACK_PENDING : INTERVIEW_STATUS[interview.status];
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center rounded-[6px] px-2 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        status.className,
        className,
      )}
    >
      {status.label}
    </span>
  );
}
