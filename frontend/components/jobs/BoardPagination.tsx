"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";

import { BoardLink, useBoard } from "@/components/jobs/BoardNavigation";
import { withChanges } from "@/components/jobs/board";
import { buttonStyles } from "@/components/ui/Button";

const STEP = buttonStyles({ variant: "secondary", size: "lg", className: "min-w-[6.5rem] px-4 sm:min-w-[7.75rem]" });

/** Previous and Next, as links to the board's other pages; each adds to the history, so Back returns to this one. */
export function BoardPagination({ page, pages }: { page: number; pages: number }) {
  const { query } = useBoard();
  if (pages <= 1) return null;
  return (
    <nav aria-label="Pages" className="mt-8 flex items-center justify-between gap-3">
      {page > 1 ? (
        <BoardLink to={withChanges(query, { page: page - 1 })} push toResults rel="prev" className={STEP}>
          <ArrowLeft aria-hidden />
          Previous
        </BoardLink>
      ) : (
        <span aria-hidden className="min-w-[6.5rem] sm:min-w-[7.75rem]" />
      )}
      <p className="text-[0.875rem] text-charcoal tabular-nums">
        Page {page} of {pages}
      </p>
      {page < pages ? (
        <BoardLink to={withChanges(query, { page: page + 1 })} push toResults rel="next" className={STEP}>
          Next
          <ArrowRight aria-hidden />
        </BoardLink>
      ) : (
        <span aria-hidden className="min-w-[6.5rem] sm:min-w-[7.75rem]" />
      )}
    </nav>
  );
}
