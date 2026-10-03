import { ArrowDown, ArrowUp, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type MetricCardProps = {
  label: string;
  value: number;
  /** Percentage change against the previous period. */
  trend: number;
  icon: LucideIcon;
  active?: boolean;
  onSelect?: () => void;
};

/** A pipeline metric that doubles as a shortcut to filter the table. */
export function MetricCard({ label, value, trend, icon: Icon, active, onSelect }: MetricCardProps) {
  const TrendIcon = trend < 0 ? ArrowDown : ArrowUp;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={cn(
        "glass group @container flex min-h-[104px] w-full items-center gap-3 rounded-[18px] border border-border px-3.5 py-4 text-left transition-[border-color,transform,background-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-border-strong hover:bg-white/[0.015]",
        active && "border-white/25 bg-white/[0.03]",
      )}
    >
      <span className="hidden size-10 shrink-0 items-center justify-center rounded-full bg-white/[0.06] ring-1 ring-white/10 transition-colors group-hover:bg-white/[0.09] @[9rem]:flex">
        <Icon aria-hidden strokeWidth={1.6} className="size-5 text-charcoal" />
      </span>
      <span className="min-w-0">
        <span className="flex items-baseline gap-2">
          <span className="text-[28px] leading-none font-semibold tracking-tight text-ink tabular-nums">{value}</span>
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-xs font-medium tabular-nums",
              trend < 0 ? "text-red-300" : "text-emerald-300",
            )}
          >
            <TrendIcon aria-hidden className="size-3" strokeWidth={2.5} />
            <span className="sr-only">{trend < 0 ? "down" : "up"}</span>
            {Math.abs(trend)}%
          </span>
        </span>
        <span className="mt-2 block truncate text-[12.5px] leading-snug text-stone">{label}</span>
      </span>
    </button>
  );
}
