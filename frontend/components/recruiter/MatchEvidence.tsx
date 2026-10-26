import { Check, Minus } from "lucide-react";

import { cn } from "@/lib/utils";
import { SOURCE_LABELS, type CandidateMatch } from "@/types/matching";

/**
 * Why a candidate is on the shortlist: each criterion their application shows (✓, with where), the ones
 * it doesn't (–), and years of relevant experience they state, quoted. Never a score.
 */
export function MatchEvidence({ match, className }: { match: CandidateMatch; className?: string }) {
  const shown = match.evidence.filter((item) => item.matched);
  const missing = match.evidence.filter((item) => !item.matched);
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {match.evidence.length > 0 && (
        <p className="sr-only">
          Matches {match.matched} of {match.evidence.length} criteria
        </p>
      )}
      <ul aria-label={`Why ${match.name} matches`} className="flex flex-wrap items-center gap-1">
        {shown.map((item) => (
          <li
            key={item.criterion}
            title={item.source ? `From their ${SOURCE_LABELS[item.source]}` : undefined}
            className="inline-flex min-h-6 items-center gap-1 rounded-[12px] bg-sage/[0.08] px-2 py-0.5 text-xs leading-tight text-sage ring-1 ring-sage/20"
          >
            <Check aria-hidden className="size-3" strokeWidth={2.5} />
            {item.criterion}
            {item.source && item.source !== "skills" && <span className="text-sage/75">· {SOURCE_LABELS[item.source]}</span>}
          </li>
        ))}
        {match.experience && (
          <li
            title={`“${match.experience.quote}”`}
            className="inline-flex min-h-6 items-center gap-1 rounded-[12px] bg-sage/[0.08] px-2 py-0.5 text-xs leading-tight text-sage ring-1 ring-sage/20"
          >
            <Check aria-hidden className="size-3" strokeWidth={2.5} />
            {match.experience.label}
            <span className="text-sage/75">· {SOURCE_LABELS[match.experience.source]}</span>
          </li>
        )}
        {missing.map((item) => (
          <li key={item.criterion} className="inline-flex h-6 items-center gap-1 px-1 text-xs text-faint">
            <Minus aria-hidden className="size-3" />
            <span>
              <span className="sr-only">Not shown: </span>
              {item.criterion}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
