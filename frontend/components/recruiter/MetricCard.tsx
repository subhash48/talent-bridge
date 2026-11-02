import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type MetricCardProps = {
  label: string;
  value: number;
  icon: LucideIcon;
  active?: boolean;
  onSelect?: () => void;
};

/** A pipeline metric that doubles as a shortcut to filter the table. */
export function MetricCard({ label, value, icon: Icon, active, onSelect }: MetricCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={cn(
        "glass group @container flex min-h-[84px] w-full items-center gap-3 rounded-[18px] border border-border/70 px-4 py-3.5 text-left transition-[border-color,transform,background-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-border-strong",
        active && "border-accent/50 bg-brand-soft hover:border-accent/50",
      )}
    >
      <span className="hidden size-9 shrink-0 items-center justify-center rounded-full bg-ink/[0.05] ring-1 ring-ink/10 transition-colors group-hover:bg-ink/[0.08] group-aria-pressed:bg-accent-soft group-aria-pressed:ring-accent/25 @[9rem]:flex">
        <Icon aria-hidden strokeWidth={1.75} className="size-4 text-charcoal group-aria-pressed:text-brand-ink" />
      </span>
      <span className="min-w-0">
        <span className="block text-2xl leading-none font-semibold tracking-tight text-ink tabular-nums">{value}</span>
        <span className="mt-1.5 block truncate text-xs leading-snug text-stone">{label}</span>
      </span>
    </button>
  );
}
