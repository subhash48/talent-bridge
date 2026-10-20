"use client";

import { Check, Search } from "lucide-react";
import { useId, useState } from "react";

import { useCandidatePortal } from "@/components/candidate/CandidatePortalProvider";
import { EmployerLogo } from "@/components/candidate/EmployerLogo";
import { PortalStatusBadge } from "@/components/candidate/PortalStatusBadge";
import { Input } from "@/components/ui/Input";
import { pluralize } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CandidateApplicationSummary } from "@/types/portal";

function matches(application: CandidateApplicationSummary, query: string): boolean {
  return [application.company, application.jobTitle].some((text) => text.toLowerCase().includes(query));
}

/**
 * The dashboard's row of the candidate's applications, one card each: employer, role and the stage they
 * may see. Choosing a card makes it the application the whole portal shows (application -> job ->
 * company). The row scrolls sideways when the cards don't fit, with a search by company or role.
 */
export function ApplicationSelector() {
  const { me, selectedId, selectApplication } = useCandidatePortal();
  const applications = me.applications;
  const [query, setQuery] = useState("");
  const labelId = useId();
  const rowId = useId();

  if (applications.length === 0) return null;
  const many = applications.length > 1;
  const search = query.trim().toLowerCase();
  const shown = search ? applications.filter((application) => matches(application, search)) : applications;

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
          </div>
        )}
      </div>

      <p role="status" className="sr-only">
        {search ? `${pluralize(shown.length, "application")} of ${applications.length} match.` : ""}
      </p>

      {/* Padded inside so a card's selected border and focus ring aren't clipped by the scrolling. */}
      <div id={rowId} className="scrollbar-none -m-1 snap-x snap-mandatory scroll-px-1 overflow-x-auto overscroll-x-contain p-1">
        <div className="w-max min-w-full">
          {shown.length > 0 ? (
            <div role="radiogroup" aria-labelledby={labelId} className="flex gap-2.5">
              {shown.map((application) => (
                <ApplicationCard
                  key={application.id}
                  application={application}
                  selected={application.id === selectedId}
                  onSelect={() => selectApplication(application.id)}
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
  onSelect: () => void;
};

function ApplicationCard({ application, selected, onSelect }: ApplicationCardProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={`${application.company}, ${application.jobTitle}. ${application.stageLabel}`}
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
        <span className="block truncate text-[13px] leading-5 font-semibold text-ink">{application.company}</span>
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
