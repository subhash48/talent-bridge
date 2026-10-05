import { Check } from "lucide-react";

import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CandidateApplication } from "@/types/portal";

/**
 * Applied → Screening → Interview → Offer → Hired, from the application's real stage. A closed
 * application shows how far it got. Scrolls sideways on narrow screens rather than squashing.
 */
export function ApplicationProgress({ application, showDates = false }: { application: CandidateApplication; showDates?: boolean }) {
  const { steps, status, stage } = application;
  const closed = status !== "active" && stage !== "hired";
  const reached = steps.findLastIndex((step) => step.state !== "upcoming");
  const filled = Math.max(reached, 0) / (steps.length - 1);
  const inset = 100 / (steps.length * 2);

  return (
    <div className="scrollbar-none -mx-1 overflow-x-auto px-1">
      <div className="relative min-w-[420px]">
        <div aria-hidden className="absolute top-[11px] h-[2px] rounded-full bg-ink/15" style={{ left: `${inset}%`, right: `${inset}%` }}>
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-500 ease-out",
              closed ? "bg-ink/30" : "bg-ink/60",
            )}
            style={{ width: `${filled * 100}%` }}
          />
        </div>
        <ol aria-label="Application progress" className="relative grid" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
          {steps.map((step) => {
            const current = step.state === "current";
            const complete = step.state === "complete";
            return (
              <li key={step.stage} aria-current={current ? "step" : undefined} className="flex flex-col items-center gap-2.5 text-center">
                <span className="flex size-6 items-center justify-center">
                  {current ? (
                    <span className="flex size-5 items-center justify-center rounded-full bg-canvas ring-2 ring-ink">
                      <span className="size-2 rounded-full bg-ink" />
                    </span>
                  ) : complete ? (
                    <span className="flex size-5 items-center justify-center rounded-full bg-ink">
                      <Check aria-hidden className="size-3 text-canvas" strokeWidth={3.5} />
                    </span>
                  ) : (
                    <span className="size-3.5 rounded-full bg-canvas ring-1 ring-ink/25" />
                  )}
                </span>
                <span className={cn("text-[13px]", current ? "font-medium text-ink" : complete ? "text-charcoal" : "text-faint")}>
                  {step.label}
                  <span className="sr-only">{complete ? " (complete)" : current ? " (current stage)" : " (upcoming)"}</span>
                </span>
                {showDates && (
                  <span className="-mt-1.5 text-xs text-faint tabular-nums" suppressHydrationWarning>
                    {step.reachedAt ? formatDate(step.reachedAt) : "—"}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
