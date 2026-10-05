import { ArrowDown, ArrowUp, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type MetricCardProps = {
  label: string;
  value: number;
  /** Percentage change against the previous period; hidden when it can't be measured. */
  trend: number | null;
  icon: LucideIcon;
  active?: boolean;
  onSelect?: () => void;
};

/** A pipeline metric that doubles as a shortcut to filter the table. */
export function MetricCard({ label, value, trend, icon: Icon, active, onSelect }: MetricCardProps) {
  const TrendIcon = trend !== null && trend < 0 ? ArrowDown : ArrowUp;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={cn(
        "glass group @container flex min-h-[84px] w-full items-center gap-3 rounded-[14px] border border-border px-3.5 py-3 text-left transition-[border-color,transform,background-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-border-strong",
        active && "border-ink/30 hover:border-ink/30",
      )}
    >
      <span className="hidden size-9 shrink-0 items-center justify-center rounded-full bg-ink/[0.05] ring-1 ring-ink/10 transition-colors group-hover:bg-ink/[0.08] @[9rem]:flex">
        <Icon aria-hidden strokeWidth={1.75} className="size-4 text-charcoal" />
      </span>
      <span className="min-w-0">
        <span className="flex items-baseline gap-2">
          <span className="text-2xl leading-none font-semibold tracking-tight text-ink tabular-nums">{value}</span>
          {trend !== null && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 text-xs font-medium tabular-nums",
                trend < 0 ? "text-danger" : "text-sage",
              )}
            >
              <TrendIcon aria-hidden className="size-3" strokeWidth={2.5} />
              <span className="sr-only">{trend < 0 ? "down" : "up"}</span>
              {Math.abs(trend)}%
            </span>
          )}
        </span>
        <span className="mt-1.5 block truncate text-xs leading-snug text-stone">{label}</span>
      </span>
    </button>
  );
}
