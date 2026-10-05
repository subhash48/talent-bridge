import { Sparkles } from "lucide-react";

import { Skeleton } from "@/components/ui/Skeleton";
import type { AnalyticsInsights } from "@/types/analytics";

/** At most four insights about the candidate experience, written from the same numbers as the page. */
export function InsightsPanel({ insights, error }: { insights?: AnalyticsInsights | null; error?: string }) {
  if (error) return <p className="py-4 text-sm text-stone">Insights couldn&apos;t load: {error}</p>;
  if (insights === undefined) {
    return (
      <div aria-busy="true" aria-label="Loading insights" className="flex flex-col gap-3">
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} className="h-12 rounded-[10px]" />
        ))}
      </div>
    );
  }
  if (!insights || insights.insights.length === 0) {
    return <p className="py-4 text-sm text-stone">There isn&apos;t enough portal activity in this period for insights yet.</p>;
  }
  return (
    <>
      <ul className="flex flex-col gap-3.5">
        {insights.insights.map((insight) => (
          <li key={insight.title} className="flex gap-3">
            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-ink/[0.05] ring-1 ring-ink/10">
              <Sparkles aria-hidden className="size-3 text-ink" />
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-ink">{insight.title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-stone">{insight.detail}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-4 border-t border-border pt-3 text-[11px] leading-relaxed text-faint">
        About the candidate experience, from aggregate portal activity. Never a judgement of any candidate.
      </p>
    </>
  );
}
