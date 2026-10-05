import { ShieldCheck } from "lucide-react";

import { ShareRow } from "@/components/recruiter/analytics/TopicBreakdown";
import { Card } from "@/components/ui/Card";
import type { DemographicDimension, DemographicsSummary } from "@/types/analytics";

// Voluntary answers only, combined across everyone who gave them: never filtered by date or anything
// else, and groups smaller than the minimum are merged or left out by the API before they get here.

function Buckets({ dimension }: { dimension: DemographicDimension }) {
  if (dimension.suppressed || dimension.buckets.length === 0) {
    return <p className="py-3 text-sm text-stone">Not enough responses to report yet.</p>;
  }
  return (
    <ul className="divide-y divide-border">
      {dimension.buckets.map((bucket) => (
        <ShareRow key={bucket.key} label={bucket.label} share={bucket.share} />
      ))}
    </ul>
  );
}

function respondents(dimension: DemographicDimension) {
  return dimension.respondents_approx > 0 ? `About ${dimension.respondents_approx} respondents` : "Fewer than 5 respondents";
}

/** Top regions, from the region candidates chose themselves. */
export function TopRegions({ summary }: { summary: DemographicsSummary }) {
  const region = summary.dimensions.find((dimension) => dimension.dimension === "region");
  if (!region) return null;
  return (
    <>
      <Buckets dimension={region} />
      <p className="mt-3 text-[11px] leading-relaxed text-faint">
        {respondents(region)} · as candidates chose it, never inferred · all responses, groups under {summary.min_group_size}{" "}
        combined
      </p>
    </>
  );
}

/** Race / ethnicity, disability status and sexual orientation, in aggregate only. */
export function DemographicsSection({ summary }: { summary: DemographicsSummary }) {
  const dimensions = summary.dimensions.filter((dimension) => dimension.dimension !== "region");
  return (
    <section id="demographics" aria-labelledby="demographics-title" className="scroll-mt-6">
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="demographics-title" className="text-base font-semibold tracking-tight text-ink">
            Voluntary demographics
          </h2>
          <p className="mt-0.5 text-xs text-stone">All responses to date, in aggregate. Not filtered by the date range.</p>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {dimensions.map((dimension) => (
          <Card key={dimension.dimension} className="p-4">
            <h3 className="text-[13px] font-medium text-ink">{dimension.label}</h3>
            <p className="mt-0.5 mb-3 text-[11px] text-faint">{respondents(dimension)}</p>
            <Buckets dimension={dimension} />
          </Card>
        ))}
      </div>
      <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-faint">
        <ShieldCheck aria-hidden className="mt-px size-3.5 shrink-0" />
        <span>
          {summary.note} No one&apos;s individual answers are shown anywhere in Talent Bridge, and they never affect search, ranking,
          AI evaluation or any hiring decision.
        </span>
      </p>
    </section>
  );
}
