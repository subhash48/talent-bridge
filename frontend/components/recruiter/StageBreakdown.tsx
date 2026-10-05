import { STAGE_FILL_STYLES } from "@/lib/stages";
import { cn } from "@/lib/utils";
import { STAGE_LABELS } from "@/types/application";
import { PIPELINE_STAGES, type CandidateStage } from "@/types/workspace";

export type StageCounts = Record<CandidateStage, number>;

export function emptyStageCounts(): StageCounts {
  return { sourced: 0, screening: 0, interview: 0, offer: 0, hired: 0 };
}

/** Segmented bar plus legend: how a job's candidates are spread across the pipeline. */
export function StageBreakdown({ counts, className }: { counts: StageCounts; className?: string }) {
  const total = PIPELINE_STAGES.reduce((sum, stage) => sum + counts[stage], 0);
  const summary = PIPELINE_STAGES.filter((stage) => counts[stage] > 0)
    .map((stage) => `${counts[stage]} ${STAGE_LABELS[stage].toLowerCase()}`)
    .join(", ");

  return (
    <div className={className}>
      <div
        role="img"
        aria-label={total ? `Pipeline: ${summary}` : "No candidates in the pipeline yet"}
        className="flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-ink/[0.06]"
      >
        {PIPELINE_STAGES.map((stage) =>
          counts[stage] > 0 ? (
            <span
              key={stage}
              className={cn("h-full transition-[width] duration-500", STAGE_FILL_STYLES[stage])}
              style={{ width: `${(counts[stage] / total) * 100}%` }}
            />
          ) : null,
        )}
      </div>
      <ul aria-hidden className="mt-2.5 flex flex-wrap gap-x-3.5 gap-y-1.5 text-xs text-stone">
        {PIPELINE_STAGES.map((stage) => (
          <li key={stage} className={cn("flex items-center gap-1.5", counts[stage] === 0 && "opacity-50")}>
            <span className={cn("size-1.5 rounded-full", STAGE_FILL_STYLES[stage])} />
            {STAGE_LABELS[stage]} <span className="text-charcoal tabular-nums">{counts[stage]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
