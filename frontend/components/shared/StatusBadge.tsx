import { cn } from "@/lib/utils";
import { STAGE_LABELS, type ApplicationStage } from "@/types/application";

export function StatusBadge({ stage, className }: { stage: ApplicationStage; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-charcoal",
        className,
      )}
    >
      {STAGE_LABELS[stage]}
    </span>
  );
}
