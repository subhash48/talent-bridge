"use client";

import { BarChart3 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { ActivityHeatmap } from "@/components/recruiter/analytics/ActivityHeatmap";
import { DateRangeFilter, Segmented } from "@/components/recruiter/analytics/AnalyticsFilters";
import { DemographicsSection, TopRegions } from "@/components/recruiter/analytics/AudienceSections";
import { EngagementChart, EngagementLegend, EngagementTable } from "@/components/recruiter/analytics/EngagementChart";
import { InsightsPanel } from "@/components/recruiter/analytics/InsightsPanel";
import { KpiCards } from "@/components/recruiter/analytics/KpiCards";
import { TopicBreakdown } from "@/components/recruiter/analytics/TopicBreakdown";
import { DetailError } from "@/components/recruiter/DetailError";
import { RecruiterHeader } from "@/components/recruiter/RecruiterHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/services/api";
import { getAnalyticsInsights, getDemographicsSummary, getPortalAnalytics } from "@/services/analytics";
import type {
  AnalyticsInsights,
  AnalyticsRange,
  DemographicsSummary,
  Granularity,
  PortalAnalytics,
  RangePreset,
} from "@/types/analytics";

const GRANULARITY_OPTIONS = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
] as const;

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
  const insights = useKeyedRequest<AnalyticsInsights>(rangeKey, (signal) => getAnalyticsInsights(range, signal));
  const demographics = useKeyedRequest<DemographicsSummary>(String(attempt), (signal) => getDemographicsSummary(signal));

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

          <Section
            title="Portal Engagement"
            subtitle={`${data.engagement.total_visits.toLocaleString()} visits in this period`}
            aside={
              <div className="flex flex-wrap items-center gap-3">
                <EngagementLegend />
                <Segmented label="Group by" options={GRANULARITY_OPTIONS} value={granularity} onChange={setGranularity} />
              </div>
            }
          >
            {data.engagement.total_visits === 0 ? (
              <p className="py-10 text-center text-sm text-stone">No portal visits in this period yet.</p>
            ) : (
              <>
                <EngagementChart points={data.engagement.points} />
                <EngagementTable points={data.engagement.points} />
              </>
            )}
          </Section>

          <div className="grid items-start gap-4 lg:grid-cols-2">
            <Section title="What Candidates Are Looking For" subtitle="Share of portal interactions by topic">
              <TopicBreakdown items={data.topics.items} total={data.topics.total} />
            </Section>
            <Section title="When Candidates Use the Portal" subtitle="Visits by weekday and time of day">
              <ActivityHeatmap heatmap={data.heatmap} />
            </Section>
          </div>
        </div>
      ) : (
        <div aria-busy="true" aria-label="Loading analytics" className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((index) => (
              <Skeleton key={index} className="h-[104px] rounded-[14px]" />
            ))}
          </div>
          <Skeleton className="h-[300px] rounded-[14px]" />
        </div>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <Section title="Top Regions" subtitle="Where candidates are, as they told us">
          {demographics.data ? (
            <TopRegions summary={demographics.data} />
          ) : demographics.error ? (
            <p className="py-4 text-sm text-stone">Regions couldn&apos;t load: {demographics.error}</p>
          ) : (
            <Skeleton className="h-40 rounded-[10px]" />
          )}
        </Section>
        <Section title="AI Insights" subtitle="Ways to improve the candidate experience">
          <InsightsPanel insights={insights.loading ? undefined : insights.data} error={insights.loading ? undefined : insights.error} />
        </Section>
      </div>

      {demographics.data && <DemographicsSection summary={demographics.data} />}
      {data && <p className="text-[11px] leading-relaxed text-faint">{data.note}</p>}
    </div>
  );
}

function Section({ title, subtitle, aside, children }: { title: string; subtitle?: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-stone">{subtitle}</p>}
        </div>
        {aside}
      </div>
      {children}
    </Card>
  );
}
