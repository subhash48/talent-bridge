import {
  ArrowRightLeft,
  CalendarCheck,
  ClipboardCheck,
  FileText,
  Handshake,
  MessageCircleMore,
  MessageSquareText,
  Sparkles,
  UserPlus,
  type LucideIcon,
} from "lucide-react";

import { RelativeTime } from "@/components/shared/RelativeTime";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";
import type { ActivityKind, CandidateActivity as Activity } from "@/types/workspace";

const ICONS: Record<ActivityKind, LucideIcon> = {
  sourced: UserPlus,
  stage: ArrowRightLeft,
  message: MessageSquareText,
  document: FileText,
  question: MessageCircleMore,
  assessment: ClipboardCheck,
  interview: CalendarCheck,
  offer: Handshake,
  ai: Sparkles,
};

type CandidateActivityProps = {
  activities: Activity[];
  /** Show a vertical timeline rail (Activity tab) instead of a compact list (Overview). */
  timeline?: boolean;
  className?: string;
};

export function CandidateActivity({ activities, timeline, className }: CandidateActivityProps) {
  if (activities.length === 0) {
    return <p className="py-4 text-sm text-stone">No activity yet. Updates appear here as the candidate engages.</p>;
  }

  return (
    <ul className={cn("flex flex-col", timeline ? "gap-1" : "divide-y divide-border", className)}>
      {activities.map((activity, index) => {
        const Icon = ICONS[activity.kind];
        return (
          <li key={activity.id} className={cn("relative flex items-center gap-4", timeline ? "py-2" : "py-3")}>
            {timeline && index < activities.length - 1 && (
              <span aria-hidden className="absolute top-[calc(50%+20px)] left-5 h-[calc(100%-32px)] w-px bg-border" />
            )}
            <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-white/[0.05] ring-1 ring-white/[0.08]">
              <Icon aria-hidden strokeWidth={1.75} className="size-[18px] text-charcoal" />
            </span>
            <span className="min-w-0 flex-1 text-[15px] text-charcoal">{activity.label}</span>
            <RelativeTime iso={activity.occurredAt} className="shrink-0 text-[13px] text-stone" />
          </li>
        );
      })}
    </ul>
  );
}

export function CandidateActivitySkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col divide-y divide-border" aria-hidden>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-4 py-3">
          <Skeleton className="size-10 rounded-[10px]" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </div>
  );
}
