import { cn } from "@/lib/utils";
import { STAGE_BADGE_STYLES } from "@/lib/stages";
import { STAGE_LABELS, type ApplicationStage } from "@/types/application";

type StatusBadgeProps = {
  stage: ApplicationStage;
  /** Overrides the stage name, e.g. the candidate portal shows "Applied" for sourced. */
  label?: string;
  className?: string;
};

export function StatusBadge({ stage, label, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center justify-center rounded-[6px] px-2 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        STAGE_BADGE_STYLES[stage],
        className,
      )}
    >
      {label ?? STAGE_LABELS[stage]}
    </span>
  );
}
