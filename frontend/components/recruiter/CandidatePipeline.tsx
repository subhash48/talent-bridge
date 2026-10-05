import { Check } from "lucide-react";

import { PROGRESS_STEPS, stageOrder } from "@/lib/stages";
import { cn } from "@/lib/utils";
import { STAGE_LABELS } from "@/types/application";
import type { CandidateStage } from "@/types/workspace";

/** Sourced → Screening → Interview → Offer. A hired candidate shows every step complete. */
export function CandidatePipeline({ stage }: { stage: CandidateStage }) {
  const current = stageOrder(stage);
  const lastStep = PROGRESS_STEPS.length - 1;
  const filled = Math.min(current, lastStep) / lastStep;
  const inset = 100 / (PROGRESS_STEPS.length * 2);

  return (
    <div className="relative">
      <div aria-hidden className="absolute top-[11px] h-[2px] rounded-full bg-ink/15" style={{ left: `${inset}%`, right: `${inset}%` }}>
        <div
          className="h-full rounded-full bg-ink/60 transition-[width] duration-500 ease-out"
          style={{ width: `${filled * 100}%` }}
        />
      </div>
      <ol aria-label="Pipeline progress" className="relative grid" style={{ gridTemplateColumns: `repeat(${PROGRESS_STEPS.length}, minmax(0, 1fr))` }}>
        {PROGRESS_STEPS.map((step, index) => {
          const done = index < current;
          const active = index === current;
          return (
            <li key={step} aria-current={active ? "step" : undefined} className="flex flex-col items-center gap-2">
              <span className="flex size-6 items-center justify-center">
                {active ? (
                  <span className="flex size-5 items-center justify-center rounded-full bg-canvas ring-2 ring-ink transition-shadow">
                    <span className="size-1.5 rounded-full bg-ink" />
                  </span>
                ) : done ? (
                  <span className="flex size-3.5 items-center justify-center rounded-full bg-ink text-canvas">
                    {stage === "hired" && <Check aria-hidden className="size-2.5 text-canvas" strokeWidth={4} />}
                  </span>
                ) : (
                  <span className="size-3.5 rounded-full bg-canvas ring-1 ring-ink/25 ring-inset" />
                )}
              </span>
              <span className={cn("text-[13px]", active ? "font-medium text-ink" : "text-stone")}>
                {STAGE_LABELS[step]}
                {done && <span className="sr-only"> (completed)</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
