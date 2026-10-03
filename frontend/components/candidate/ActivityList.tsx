import {
  BookOpenCheck,
  CalendarDays,
  FileText,
  Gift,
  MessageSquareText,
  MessageCircleQuestion,
  Route,
  Send,
  UserRound,
  type LucideIcon,
} from "lucide-react";

import { RelativeTime } from "@/components/shared/RelativeTime";
import { cn } from "@/lib/utils";
import type { ActivityKind, CandidateActivity } from "@/types/portal";

const ICONS: Record<ActivityKind, LucideIcon> = {
  application: Send,
  stage: Route,
  interview: CalendarDays,
  message: MessageSquareText,
  prep: BookOpenCheck,
  question: MessageCircleQuestion,
  document: FileText,
  offer: Gift,
  profile: UserRound,
};

/** The candidate's timeline. Entries are already written for the candidate by the API. */
export function ActivityList({ items, className }: { items: CandidateActivity[]; className?: string }) {
  return (
    <ol className={cn("flex flex-col", className)}>
      {items.map((item, index) => {
        const Icon = ICONS[item.kind];
        return (
          <li key={item.id} className="relative flex gap-3.5 pb-5 last:pb-0">
            {index < items.length - 1 && <span aria-hidden className="absolute top-8 bottom-0 left-[15px] w-px bg-white/[0.08]" />}
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/[0.05] ring-1 ring-white/[0.08]">
              <Icon aria-hidden className="size-3.5 text-charcoal" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col pt-1.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
              <span className="text-sm text-ink">{item.title}</span>
              <RelativeTime iso={item.occurredAt} className="shrink-0 text-xs text-faint" />
            </span>
          </li>
        );
      })}
    </ol>
  );
}
