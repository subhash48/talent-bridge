import { BriefcaseBusiness, SearchX, ServerCrash, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { BoardLink } from "@/components/jobs/BoardNavigation";
import { EMPTY_QUERY, withChanges, type BoardQuery } from "@/components/jobs/board";
import { ReloadButton } from "@/components/shared/ReloadButton";
import { buttonStyles } from "@/components/ui/Button";

// The board's calm states, in place of the results. Each says what happened and offers the one way on.

function Notice({ icon: Icon, title, children, action }: { icon: LucideIcon; title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-[20px] border border-dashed border-ink/15 px-6 py-14 text-center sm:py-16">
      <span className="flex size-12 items-center justify-center rounded-full bg-accent-soft ring-1 ring-brand/15">
        <Icon aria-hidden className="size-5 text-brand-ink" />
      </span>
      <h2 className="mt-4 text-[1.125rem] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
      <p className="mt-1.5 max-w-md text-[0.9375rem] leading-relaxed text-charcoal">{children}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

/** Nothing is open anywhere on the board, with no search or filter to blame. */
export function BoardEmpty() {
  return (
    <Notice icon={BriefcaseBusiness} title="No open roles right now">
      Jobs from recruiting teams and small businesses appear here as soon as they&apos;re posted. Check back soon.
    </Notice>
  );
}

/** The search, a filter or the tab rules everything out. */
export function NoMatches({ query, allCount }: { query: BoardQuery; allCount: number }) {
  // On a tab with nothing, the other tabs may still have jobs for the same search: say so, rather than clear it all.
  const elsewhere = query.source !== null && allCount > 0;
  return (
    <Notice
      icon={SearchX}
      title="No jobs match these filters."
      action={
        <div className="flex flex-wrap justify-center gap-3">
          {elsewhere && (
            <BoardLink to={withChanges(query, { source: null })} className={buttonStyles({ size: "lg" })}>
              See all {allCount.toLocaleString("en-US")} {allCount === 1 ? "match" : "matches"}
            </BoardLink>
          )}
          <BoardLink to={EMPTY_QUERY} className={buttonStyles({ variant: elsewhere ? "secondary" : "primary", size: "lg" })}>
            Clear filters
          </BoardLink>
        </div>
      }
    >
      {elsewhere
        ? "Nothing on this tab fits, but other jobs do."
        : "Try removing a filter, a broader search, or a different location."}
    </Notice>
  );
}

/** A page number past the last result, from an old link or a board that shrank. */
export function PastTheEnd({ query }: { query: BoardQuery }) {
  return (
    <Notice
      icon={SearchX}
      title="This page is past the last job"
      action={
        <BoardLink to={withChanges(query, { page: 1 })} className={buttonStyles({ size: "lg" })}>
          Back to the first page
        </BoardLink>
      }
    >
      The board has fewer jobs than it did when this link was made.
    </Notice>
  );
}

/** The API couldn't be reached, or failed. Retrying renders the page again, which asks again. */
export function BoardUnavailable({ message }: { message: string }) {
  return (
    <Notice icon={ServerCrash} title="Jobs can't load right now" action={<ReloadButton>Retry</ReloadButton>}>
      {message}
    </Notice>
  );
}
