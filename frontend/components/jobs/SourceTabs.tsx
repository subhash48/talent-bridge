"use client";

import { BoardLink, useBoard } from "@/components/jobs/BoardNavigation";
import { SOURCE_TABS, withChanges } from "@/components/jobs/board";
import { cn } from "@/lib/utils";
import type { JobBoardPage } from "@/types/careers";

/**
 * All Jobs / Recruiter Jobs / Small Business Jobs. Each tab is a link to its own URL, marked as the current page,
 * with the number of jobs it holds under the same search and filters.
 */
export function SourceTabs({ counts, className }: { counts: JobBoardPage["counts"]; className?: string }) {
  const { query } = useBoard();
  return (
    <nav aria-label="Who posted the job" className={cn("scrollbar-none -mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0", className)}>
      <ul className="flex min-w-max gap-1 border-b border-ink/10">
        {SOURCE_TABS.map((tab) => {
          const active = query.source === tab.source;
          return (
            <li key={tab.label}>
              <BoardLink
                to={withChanges(query, { source: tab.source })}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative -mb-px inline-flex h-12 items-center gap-2 rounded-t-[10px] border-b-2 px-3 text-[15px] font-medium whitespace-nowrap transition-colors sm:px-4",
                  active ? "border-brand text-ink" : "border-transparent text-charcoal hover:border-ink/20 hover:text-ink",
                )}
              >
                {tab.label}
                <span
                  className={cn(
                    "min-w-7 rounded-full px-2 py-0.5 text-center text-[12px] font-semibold tabular-nums transition-colors",
                    active ? "bg-brand text-on-brand" : "bg-ink/[0.06] text-charcoal",
                  )}
                >
                  {counts[tab.count].toLocaleString("en-US")}
                </span>
              </BoardLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
