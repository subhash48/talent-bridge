import { Card } from "@/components/ui/Card";
import { ENGAGEMENT_LABELS, type EngagementLevel, type EngagementSignal } from "@/types/event";

type EngagementPanelProps = {
  level: EngagementLevel;
  signals: EngagementSignal[];
};

// Shows the level and the signals behind it, never a score (ARCHITECTURE.md 5.7).
export function EngagementPanel({ level, signals }: EngagementPanelProps) {
  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-ink">Engagement</h2>
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-charcoal">
          {ENGAGEMENT_LABELS[level]}
        </span>
      </div>
      {signals.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-2 text-sm text-charcoal">
          {signals.map((signal) => (
            <li key={signal.key}>{signal.label}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-stone">No signals yet.</p>
      )}
      <p className="mt-6 text-xs text-stone">
        Engagement reflects responsiveness to our process, not candidate quality.
      </p>
    </Card>
  );
}
