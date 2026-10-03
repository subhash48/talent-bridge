import { cn } from "@/lib/utils";
import { STAGE_BADGE_STYLES } from "@/lib/stages";
import { STAGE_LABELS, type ApplicationStage } from "@/types/application";

export function StatusBadge({ stage, className }: { stage: ApplicationStage; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center justify-center rounded-[8px] px-2.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        STAGE_BADGE_STYLES[stage],
        className,
      )}
    >
      {STAGE_LABELS[stage]}
    </span>
  );
}
