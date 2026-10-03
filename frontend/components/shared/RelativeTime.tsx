import { formatDateTime, formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

// Server and browser may disagree by a few seconds; the label is the same either way.
export function RelativeTime({ iso, className }: { iso: string; className?: string }) {
  return (
    <time dateTime={iso} title={formatDateTime(iso)} suppressHydrationWarning className={cn("tabular-nums", className)}>
      {formatRelativeTime(iso)}
    </time>
  );
}
