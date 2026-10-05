import type { Metadata } from "next";

import { AnalyticsView } from "@/components/recruiter/analytics/AnalyticsView";
import { RANGE_PRESETS, type AnalyticsRange, type RangePreset } from "@/types/analytics";

export const metadata: Metadata = { title: "Analytics" };

type AnalyticsPageProps = { searchParams: Promise<{ range?: string | string[]; start?: string | string[]; end?: string | string[] }> };

const one = (value?: string | string[]) => (typeof value === "string" ? value : undefined);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function AnalyticsPage({ searchParams }: AnalyticsPageProps) {
  const params = await searchParams;
  const requested = one(params.range);
  const preset: RangePreset = RANGE_PRESETS.includes(requested as RangePreset) ? (requested as RangePreset) : "last_30_days";
  const start = one(params.start);
  const end = one(params.end);
  const range: AnalyticsRange =
    preset === "custom"
      ? start && end && DATE.test(start) && DATE.test(end)
        ? { preset, start, end }
        : { preset: "last_30_days" }
      : { preset };
  return <AnalyticsView initialRange={range} />;
}
