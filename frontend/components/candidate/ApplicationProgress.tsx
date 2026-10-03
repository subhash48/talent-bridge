import { cn } from "@/lib/utils";
import { JOURNEY_STAGES, type JourneyStageKey } from "@/types/application";

// Candidate-facing stage projection: internal stages such as "sourced" never appear (ARCHITECTURE.md 4).
export function ApplicationProgress({ current }: { current?: JourneyStageKey }) {
  const currentIndex = current ? JOURNEY_STAGES.findIndex((stage) => stage.key === current) : -1;

  return (
    <ol className="flex items-center gap-4">
      {JOURNEY_STAGES.map((stage, index) => (
        <li key={stage.key} className="flex items-center gap-2">
          <span
            className={cn(
              "h-2.5 w-2.5 rounded-full bg-border",
              index < currentIndex && "bg-sage",
              index === currentIndex && "bg-ink ring-4 ring-sage/30",
            )}
          />
          <span className={cn("text-sm text-stone", index === currentIndex && "font-medium text-ink")}>
            {stage.label}
          </span>
        </li>
      ))}
    </ol>
  );
}
