import { BriefcaseBusiness, Clock, UserRound, UsersRound } from "lucide-react";

import { MetricCard } from "@/components/recruiter/MetricCard";
import type { MetricKey, PipelineCandidate } from "@/types/workspace";

const METRICS = [
  { key: "total", label: "Total candidates", icon: UsersRound },
  { key: "interviews", label: "In interviews", icon: UserRound },
  { key: "followUp", label: "Need follow-up", icon: Clock },
  { key: "offers", label: "Offers", icon: BriefcaseBusiness },
] as const;

type DashboardMetricsProps = {
  candidates: PipelineCandidate[];
  trends: Record<MetricKey, number>;
  active?: MetricKey;
  onSelect: (metric: MetricKey) => void;
};

/** Values are derived from the live candidate list; trends come from the dashboard summary. */
export function DashboardMetrics({ candidates, trends, active, onSelect }: DashboardMetricsProps) {
  const values: Record<MetricKey, number> = {
    total: candidates.length,
    interviews: candidates.filter((candidate) => candidate.stage === "interview").length,
    followUp: candidates.filter((candidate) => candidate.followUp).length,
    offers: candidates.filter((candidate) => candidate.stage === "offer").length,
  };

  return (
    <section aria-label="Pipeline metrics" className="@container">
      <div className="grid grid-cols-2 gap-3 @[34rem]:grid-cols-4">
        {METRICS.map((metric) => (
          <MetricCard
            key={metric.key}
            label={metric.label}
            icon={metric.icon}
            value={values[metric.key]}
            trend={trends[metric.key]}
            active={active === metric.key}
            onSelect={() => onSelect(metric.key)}
          />
        ))}
      </div>
    </section>
  );
}
