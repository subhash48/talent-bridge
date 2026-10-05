import { USE_MOCK_API, apiFetch } from "@/services/api";
import type {
  AnalyticsInsights,
  AnalyticsRange,
  DemographicsSummary,
  Granularity,
  PortalAnalytics,
} from "@/types/analytics";

// Candidate Portal analytics (/analytics/*), for recruiters. Every number is calculated by the API from
// the portal's own records on each request; nothing here is computed or stored in the browser. Mock mode
// has no portal, so it has no analytics either (null).

function query(range: AnalyticsRange, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams({
    range: range.preset,
    // The browser's offset, so days, weeks and the activity heatmap are in the recruiter's own time.
    utc_offset_minutes: String(-new Date().getTimezoneOffset()),
    ...extra,
  });
  if (range.preset === "custom" && range.start && range.end) {
    params.set("start", range.start);
    params.set("end", range.end);
  }
  return params.toString();
}

/** GET /analytics/portal: KPIs, engagement over time, topics and the activity heatmap. */
export async function getPortalAnalytics(
  range: AnalyticsRange,
  granularity: Granularity,
  signal?: AbortSignal,
): Promise<PortalAnalytics | null> {
  if (USE_MOCK_API) return null;
  return apiFetch<PortalAnalytics>(`/analytics/portal?${query(range, { granularity })}`, { signal });
}

/** GET /analytics/insights: at most four, about the candidate experience. Slower (it may ask the AI). */
export async function getAnalyticsInsights(range: AnalyticsRange, signal?: AbortSignal): Promise<AnalyticsInsights | null> {
  if (USE_MOCK_API) return null;
  return apiFetch<AnalyticsInsights>(`/analytics/insights?${query(range)}`, { signal });
}

/** GET /analytics/demographics: every voluntary answer, aggregated, small groups combined. Not date-filtered. */
export async function getDemographicsSummary(signal?: AbortSignal): Promise<DemographicsSummary | null> {
  if (USE_MOCK_API) return null;
  return apiFetch<DemographicsSummary>("/analytics/demographics", { signal });
}
