"use client";

import { Check, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import { useCandidatePortal } from "@/components/candidate/CandidatePortalProvider";
import { EmployerLogo } from "@/components/candidate/EmployerLogo";
import { PortalStatusBadge } from "@/components/candidate/PortalStatusBadge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { pluralize } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CandidateApplicationSummary } from "@/types/portal";

// How far the edges fade while there's more to scroll to that side. Cards snap this far in from the
// left edge, so the one in front is always clear of the fade.
const FADE_PX = 28;

const scrollBehavior = (): ScrollBehavior =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";

function matches(application: CandidateApplicationSummary, query: string): boolean {
  return [application.company, application.jobTitle].some((text) => text.toLowerCase().includes(query));
}

/**
 * The dashboard's row of the candidate's applications, one card each: employer, role and the stage they
 * may see. Choosing a card makes it the application the whole portal shows (application -> job ->
 * company). The row scrolls sideways: arrows on wider screens, touch on phones, and a search by company
 * or role. Keyboard: the cards are one radio group, so Tab reaches the chosen one and the arrow keys move.
 */
export function ApplicationSelector() {
  const { me, selectedId, selectApplication } = useCandidatePortal();
  const applications = me.applications;
  const [query, setQuery] = useState("");
  const [edges, setEdges] = useState({ back: false, forward: false });
  const scroller = useRef<HTMLDivElement>(null);
  const row = useRef<HTMLDivElement>(null);
  const placed = useRef(false);
  const labelId = useId();
  const rowId = useId();

  const any = applications.length > 0;
  const many = applications.length > 1;
  const search = query.trim().toLowerCase();
  const shown = search ? applications.filter((application) => matches(application, search)) : applications;
  const tabStop = shown.some((application) => application.id === selectedId) ? selectedId : shown[0]?.id;

  // Whether there's more to scroll to on either side, for the arrows and the fades. Watching the row
  // as well as the scroller catches cards coming and going with the search.
  useEffect(() => {
    const box = scroller.current;
    const content = row.current;
    if (!box || !content) return;
    const measure = () => {
      const back = box.scrollLeft > 1;
      const forward = box.scrollLeft + box.clientWidth < box.scrollWidth - 1;
      setEdges((current) => (current.back === back && current.forward === forward ? current : { back, forward }));
    };
    const resized = new ResizeObserver(measure);
    resized.observe(box);
    resized.observe(content);
    box.addEventListener("scroll", measure, { passive: true });
    return () => {
      resized.disconnect();
      box.removeEventListener("scroll", measure);
    };
  }, [any]);

  // The chosen card is always in view (at a snap point): straight away on arrival, smoothly after a change.
  useEffect(() => {
    const box = scroller.current;
    const card = box?.querySelector<HTMLElement>(`[data-application="${selectedId}"]`);
    if (!box || !card) return;
    const view = box.getBoundingClientRect();
    const target = card.getBoundingClientRect();
    const behavior = placed.current ? scrollBehavior() : "auto";
    placed.current = true;
    const hidden = target.left < view.left + FADE_PX - 1 || target.right > view.right - FADE_PX + 1;
    if (hidden) box.scrollBy({ left: target.left - view.left - FADE_PX, behavior });
  }, [selectedId]);

  if (!any) return null;

  const page = (direction: 1 | -1) => {
    const box = scroller.current;
    if (box) box.scrollBy({ left: direction * Math.max(box.clientWidth - 2 * FADE_PX, 160), behavior: scrollBehavior() });
  };

  const choose = (id: string, focus = false) => {
    selectApplication(id);
    // Focus without the browser's own scrolling: the effect above brings the card to a snap point.
    if (focus) scroller.current?.querySelector<HTMLElement>(`[data-application="${id}"]`)?.focus({ preventScroll: true });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const focused = event.target instanceof HTMLElement ? event.target.dataset.application : undefined;
    const index = shown.findIndex((application) => application.id === focused);
    if (index < 0) return;
    const last = shown.length - 1;
    const moves: Record<string, number> = {
      ArrowRight: index === last ? 0 : index + 1,
      ArrowDown: index === last ? 0 : index + 1,
      ArrowLeft: index === 0 ? last : index - 1,
      ArrowUp: index === 0 ? last : index - 1,
      Home: 0,
      End: last,
    };
    const next = moves[event.key];
    if (next === undefined) return;
    event.preventDefault();
    choose(shown[next].id, true);
  };

  const fade = (more: boolean, side: "left" | "right") =>
    more ? `linear-gradient(to ${side}, #000 calc(100% - ${FADE_PX}px), transparent)` : "linear-gradient(#000, #000)";

  return (
    <section aria-labelledby={labelId} className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <h2 id={labelId} className="shrink-0 text-[13px] font-semibold text-ink">
          {many ? "My applications" : "My application"}
          {many && <span className="ml-1.5 font-normal text-stone tabular-nums">{applications.length}</span>}
        </h2>
        {many && (
          <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-1.5">
            <div className="relative min-w-0 flex-1 sm:max-w-64">
              <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-faint" />
              <Input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape" && query) {
                    event.preventDefault();
                    setQuery("");
                  }
                }}
                placeholder="Search company or role"
                aria-label="Search your applications by company or role"
                aria-controls={rowId}
                autoComplete="off"
                className="h-8 pl-8 text-[13px]"
              />
            </div>
            <div className="hidden items-center gap-1 sm:flex">
              <Button
                variant="secondary"
                size="icon-sm"
                aria-label="Scroll back through your applications"
                aria-controls={rowId}
                disabled={!edges.back}
                onClick={() => page(-1)}
                className="size-8"
              >
                <ChevronLeft />
              </Button>
              <Button
                variant="secondary"
                size="icon-sm"
                aria-label="Scroll on through your applications"
                aria-controls={rowId}
                disabled={!edges.forward}
                onClick={() => page(1)}
                className="size-8"
              >
                <ChevronRight />
              </Button>
            </div>
          </div>
        )}
      </div>

      <p role="status" className="sr-only">
        {search ? `${pluralize(shown.length, "application")} of ${applications.length} match.` : ""}
      </p>

      {/* Padded inside so a card's selected border and focus ring aren't clipped by the scrolling. */}
      <div
        ref={scroller}
        id={rowId}
        className="scrollbar-none -m-1 snap-x snap-mandatory scroll-px-[28px] overflow-x-auto overscroll-x-contain p-1"
        style={{
          maskImage: `${fade(edges.back, "left")}, ${fade(edges.forward, "right")}`,
          maskComposite: "intersect",
        }}
      >
        <div ref={row} className="w-max min-w-full">
          {shown.length > 0 ? (
            <div role="radiogroup" aria-labelledby={labelId} onKeyDown={onKeyDown} className="flex gap-2.5">
              {shown.map((application) => (
                <ApplicationCard
                  key={application.id}
                  application={application}
                  selected={application.id === selectedId}
                  tabbable={application.id === tabStop}
                  onSelect={() => choose(application.id)}
                />
              ))}
            </div>
          ) : (
            <div className="flex min-h-[78px] items-center gap-2 rounded-[12px] border border-dashed border-border-strong px-4 text-[13px] text-stone">
              <span className="min-w-0 truncate">No applications match “{query.trim()}”.</span>
              <button type="button" onClick={() => setQuery("")} className="shrink-0 font-medium text-brand-ink underline-offset-2 hover:underline">
                Clear search
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

type ApplicationCardProps = {
  application: CandidateApplicationSummary;
  selected: boolean;
  /** The card Tab reaches: the chosen one, or the first shown when the search hides it. */
  tabbable: boolean;
  onSelect: () => void;
};

function ApplicationCard({ application, selected, tabbable, onSelect }: ApplicationCardProps) {
  const unread = application.unreadMessages;
  const name = [`${application.company}, ${application.jobTitle}`, application.stageLabel];
  if (unread > 0) name.push(pluralize(unread, "unread message"));
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={name.join(". ")}
      tabIndex={tabbable ? 0 : -1}
      data-application={application.id}
      onClick={onSelect}
      className={cn(
        "relative flex w-[15.5rem] shrink-0 snap-start items-center gap-3 rounded-[12px] border py-2.5 pr-8 pl-2.5 text-left transition-[background-color,border-color,box-shadow] duration-200 focus-visible:ring-[3px] focus-visible:ring-brand-ink/65 focus-visible:outline-none",
        selected
          ? "border-brand-ink/45 bg-brand-soft shadow-[0_0_0_2px_var(--color-brand)]"
          : "border-border bg-surface/80 hover:border-border-strong hover:bg-surface-raised",
      )}
    >
      <EmployerLogo name={application.company} logoUrl={application.companyLogoUrl} size={40} className="rounded-[9px]" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[13px] leading-5 font-semibold text-ink">{application.company}</span>
          {unread > 0 && <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-highlight" />}
        </span>
        <span className="block truncate text-xs leading-4 text-stone">{application.jobTitle}</span>
        <PortalStatusBadge
          stage={application.stage}
          status={application.status}
          label={application.stageLabel}
          className="mt-1.5 h-5 rounded-[5px] px-1.5 text-[11px]"
        />
      </span>
      {selected && (
        <span aria-hidden className="absolute top-2 right-2 flex size-[18px] items-center justify-center rounded-full bg-brand text-on-brand">
          <Check strokeWidth={3} className="size-3" />
        </span>
      )}
    </button>
  );
}
