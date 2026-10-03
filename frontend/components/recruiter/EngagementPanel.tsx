import { Card } from "@/components/ui/Card";
import { ENGAGEMENT_STYLES } from "@/lib/stages";
import { cn } from "@/lib/utils";
import { ENGAGEMENT_LABELS, type EngagementLevel, type EngagementSignal } from "@/types/event";

type EngagementPanelProps = {
  level: EngagementLevel;
  signals: EngagementSignal[];
};

const POLARITY_DOT: Record<EngagementSignal["polarity"], string> = {
  positive: "bg-emerald-300",
  neutral: "bg-zinc-400",
  negative: "bg-amber-300",
};

// Shows the level and the signals behind it, never a score (ARCHITECTURE.md 5.7).
export function EngagementPanel({ level, signals }: EngagementPanelProps) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-ink">Engagement</h2>
        <span className={cn("rounded-full bg-white/[0.06] px-2.5 py-0.5 text-xs font-medium", ENGAGEMENT_STYLES[level])}>
          {ENGAGEMENT_LABELS[level]}
        </span>
      </div>
      {signals.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-2.5 text-sm text-charcoal">
          {signals.map((signal) => (
            <li key={signal.key} className="flex items-center gap-2.5">
              <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", POLARITY_DOT[signal.polarity])} />
              <span className="sr-only">{signal.polarity} signal: </span>
              {signal.label}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-stone">No signals yet.</p>
      )}
      <p className="mt-5 border-t border-border pt-4 text-xs leading-relaxed text-faint">
        Engagement reflects responsiveness to our process, not candidate quality.
      </p>
    </Card>
  );
}
