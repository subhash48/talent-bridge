import { ArrowDown, ArrowUp, Clock, Repeat, UserCheck, UsersRound, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Kpi, KpiKey } from "@/types/analytics";

const ICONS: Record<KpiKey, LucideIcon> = {
  active_candidates: UsersRound,
  weekly_engaged: UserCheck,
  avg_engagement_time: Clock,
  repeat_visit_rate: Repeat,
};

/** The four headline numbers, each with its change against the comparison period. */
export function KpiCards({ kpis }: { kpis: Kpi[] }) {
  return (
    <section aria-label="Key metrics" className="@container">
      <div className="grid grid-cols-2 gap-3 @[46rem]:grid-cols-4">
        {kpis.map((kpi) => (
          <KpiCard key={kpi.key} kpi={kpi} />
        ))}
      </div>
    </section>
  );
}

function KpiCard({ kpi }: { kpi: Kpi }) {
  const Icon = ICONS[kpi.key];
  return (
    <article className="glass flex min-h-[104px] flex-col justify-between gap-2 rounded-[14px] border border-border px-4 py-3.5" title={kpi.description}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="line-clamp-2 text-xs leading-snug text-stone">{kpi.label}</h2>
        <Icon aria-hidden strokeWidth={1.75} className="size-4 shrink-0 text-faint" />
      </div>
      <p className="text-[26px] leading-none font-semibold tracking-tight text-ink">{kpi.display}</p>
      <Change kpi={kpi} />
      <p className="sr-only">{kpi.description}</p>
    </article>
  );
}

function Change({ kpi }: { kpi: Kpi }) {
  if (kpi.change === null) return <p className="text-[11px] text-faint">No earlier data to compare</p>;
  const rounded = Math.round(kpi.change);
  const unit = kpi.change_unit === "points" ? " pts" : "%";
  const Arrow = rounded < 0 ? ArrowDown : ArrowUp;
  return (
    <p className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[11px] text-stone">
      <span className={cn("inline-flex items-center gap-0.5 font-medium whitespace-nowrap tabular-nums", rounded < 0 ? "text-danger" : "text-sage")}>
        <Arrow aria-hidden strokeWidth={2.5} className="size-3" />
        <span className="sr-only">{rounded < 0 ? "Down" : "Up"}</span>
        {rounded > 0 ? "+" : rounded < 0 ? "−" : ""}
        {Math.abs(rounded)}
        {unit}
      </span>
      <span>{kpi.comparison}</span>
    </p>
  );
}
