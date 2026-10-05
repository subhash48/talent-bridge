"use client";

import { BarChart3 } from "lucide-react";
import { useEffect, useState } from "react";

import { DateRangeFilter } from "@/components/recruiter/analytics/AnalyticsFilters";
import { KpiCards } from "@/components/recruiter/analytics/KpiCards";
import { DetailError } from "@/components/recruiter/DetailError";
import { RecruiterHeader } from "@/components/recruiter/RecruiterHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/services/api";
import { getPortalAnalytics } from "@/services/analytics";
import type {
  AnalyticsRange,
  Granularity,
  PortalAnalytics,
  RangePreset,
} from "@/types/analytics";

const DEFAULT_GRANULARITY: Record<RangePreset, Granularity> = {
  today: "day",
  last_7_days: "day",
  last_30_days: "day",
  last_90_days: "week",
  this_year: "month",
  custom: "day",
};

type Loaded<T> = { key: string; data?: T | null; error?: string };

/** Loads one request per key, keeping the last answer on screen while the next one loads. */
function useKeyedRequest<T>(key: string, load: (signal: AbortSignal) => Promise<T | null>): Loaded<T> & { loading: boolean } {
  const [result, setResult] = useState<Loaded<T>>({ key: "" });
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).then(
      (data) => setResult({ key, data }),
      (error: unknown) => {
        if (!controller.signal.aborted) setResult((previous) => ({ key, data: previous.data, error: errorMessage(error) }));
      },
    );
    return () => controller.abort();
    // load is rebuilt on every render; the key says when it means something new.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { ...result, loading: result.key !== key };
}

/** /recruiter/analytics: how candidates use the Candidate Portal, in aggregate. */
export function AnalyticsView({ initialRange }: { initialRange: AnalyticsRange }) {
  const [range, setRange] = useState(initialRange);
  const [granularity, setGranularity] = useState<Granularity>(DEFAULT_GRANULARITY[initialRange.preset]);
  const [attempt, setAttempt] = useState(0);
  const rangeKey = JSON.stringify([range, attempt]);

  const portal = useKeyedRequest<PortalAnalytics>(`${rangeKey}|${granularity}`, (signal) =>
    getPortalAnalytics(range, granularity, signal),
  );

  function changeRange(next: AnalyticsRange) {
    setRange(next);
    setGranularity(DEFAULT_GRANULARITY[next.preset]);
    // Keep the range in the address, so a link from the assistant or a reload opens the same view.
    const url = new URL(window.location.href);
    url.searchParams.set("range", next.preset);
    if (next.preset === "custom" && next.start && next.end) {
      url.searchParams.set("start", next.start);
      url.searchParams.set("end", next.end);
    } else {
      url.searchParams.delete("start");
      url.searchParams.delete("end");
    }
    window.history.replaceState(null, "", url);
  }

  const header = (
    <RecruiterHeader
      title="Analytics"
      subtitle="Understand how candidates engage with your hiring experience."
      actions={<DateRangeFilter value={range} onChange={changeRange} />}
    />
  );

  if (portal.data === null) {
    return (
      <div>
        {header}
        <EmptyState
          icon={BarChart3}
          title="Analytics needs the Talent Bridge API"
          description="Candidate Portal analytics are calculated from real portal activity. Turn off mock mode to see them."
        />
      </div>
    );
  }

  const data = portal.data;
  return (
    <div className="flex flex-col gap-4 pb-4">
      {header}
      {portal.error && !portal.loading && (
        <DetailError message={`Analytics couldn't load: ${portal.error}`} onRetry={() => setAttempt((count) => count + 1)} />
      )}

      {data ? (
        <div className={cn("flex flex-col gap-4 transition-opacity duration-200", portal.loading && "opacity-60")} aria-busy={portal.loading}>
          <div className="flex items-center justify-between gap-3 text-xs text-faint">
            <span>
              {data.period.label}
              {portal.loading && <span className="ml-2 text-stone">Updating…</span>}
            </span>
          </div>
          <KpiCards kpis={data.kpis} />
        </div>
      ) : (
        <div aria-busy="true" aria-label="Loading analytics" className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((index) => (
              <Skeleton key={index} className="h-[104px] rounded-[14px]" />
            ))}
          </div>
        </div>
      )}

      {data && <p className="text-[11px] leading-relaxed text-faint">{data.note}</p>}
    </div>
  );
}
