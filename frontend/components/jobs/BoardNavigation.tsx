"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useOptimistic,
  useTransition,
  type ComponentProps,
  type MouseEvent,
  type ReactNode,
} from "react";

import { boardHref, type BoardQuery } from "@/components/jobs/board";
import { cn } from "@/lib/utils";

// The board's state is its URL, and the server renders every state. Changing it here asks for the new URL inside
// a transition: the current results stay on screen (dimmed) until the new ones arrive, and the controls show the
// new choice at once (useOptimistic) rather than waiting for the server.

type GoOptions = {
  /** A new history entry (paging), rather than replacing this one (a filter or a search). */
  push?: boolean;
  /** Bring the results' top into view, for a new page. */
  toResults?: boolean;
};

type Board = {
  /** The state the controls show: the URL's, or the one being loaded. */
  query: BoardQuery;
  pending: boolean;
  go: (next: BoardQuery, options?: GoOptions) => void;
};

const BoardContext = createContext<Board | null>(null);

export const RESULTS_ID = "job-results";

export function BoardProvider({ query, children }: { query: BoardQuery; children: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [shown, setShown] = useOptimistic(query);

  const go = useCallback(
    (next: BoardQuery, { push = false, toResults = false }: GoOptions = {}) => {
      if (toResults) {
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        document.getElementById(RESULTS_ID)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
      }
      startTransition(() => {
        setShown(next);
        const href = boardHref(next);
        if (push) router.push(href, { scroll: false });
        else router.replace(href, { scroll: false });
      });
    },
    [router, setShown],
  );

  const board = useMemo(() => ({ query: shown, pending, go }), [shown, pending, go]);
  return <BoardContext.Provider value={board}>{children}</BoardContext.Provider>;
}

export function useBoard(): Board {
  const board = useContext(BoardContext);
  if (!board) throw new Error("useBoard needs a BoardProvider.");
  return board;
}

type BoardLinkProps = Omit<ComponentProps<typeof Link>, "href" | "onClick"> & { to: BoardQuery } & GoOptions;

/**
 * A real link to another state of the board (it opens in a new tab, and works before the page's script loads),
 * which in place goes through the board's transition so the pending state shows.
 */
export function BoardLink({ to, push, toResults, ...props }: BoardLinkProps) {
  const { go } = useBoard();

  function follow(event: MouseEvent<HTMLAnchorElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    go(to, { push, toResults });
  }

  return <Link href={boardHref(to)} scroll={false} onClick={follow} {...props} />;
}

/** The results, dimmed and marked busy while the next ones load; a small notice says so for everyone. */
export function BoardResults({ children, className }: { children: ReactNode; className?: string }) {
  const { pending } = useBoard();
  return (
    <section id={RESULTS_ID} aria-label="Jobs" aria-busy={pending} className={cn("relative scroll-mt-28", className)}>
      <div
        className={cn(
          "transition-opacity duration-200",
          pending && "pointer-events-none opacity-55 delay-150 motion-reduce:transition-none",
        )}
      >
        {children}
      </div>
      {/* No height of its own: it rides the bottom of the screen while the results are in view. */}
      <div className="pointer-events-none sticky bottom-6 z-10 flex h-0 items-end justify-center">
        <p
          role="status"
          className={cn(
            "inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-on-brand shadow-raised transition-[opacity,transform] duration-200",
            pending ? "translate-y-0 opacity-100 delay-150" : "translate-y-2 opacity-0",
          )}
        >
          <span aria-hidden className="size-3.5 animate-spin rounded-full border-2 border-on-brand/35 border-t-on-brand" />
          {pending ? "Updating results…" : ""}
        </p>
      </div>
    </section>
  );
}
