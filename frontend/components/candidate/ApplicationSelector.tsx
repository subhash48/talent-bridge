"use client";

import { Check } from "lucide-react";
import { useId } from "react";

import { useCandidatePortal } from "@/components/candidate/CandidatePortalProvider";
import { EmployerLogo } from "@/components/candidate/EmployerLogo";
import { PortalStatusBadge } from "@/components/candidate/PortalStatusBadge";
import { cn } from "@/lib/utils";
import type { CandidateApplicationSummary } from "@/types/portal";

/**
 * The dashboard's row of the candidate's applications, one card each: employer, role and the stage they
 * may see. Choosing a card makes it the application the whole portal shows (application -> job ->
 * company). The row scrolls sideways when the cards don't fit.
 */
export function ApplicationSelector() {
  const { me, selectedId, selectApplication } = useCandidatePortal();
  const applications = me.applications;
  const labelId = useId();

  if (applications.length === 0) return null;
  const many = applications.length > 1;

  return (
    <section aria-labelledby={labelId} className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <h2 id={labelId} className="shrink-0 text-[13px] font-semibold text-ink">
          {many ? "My applications" : "My application"}
          {many && <span className="ml-1.5 font-normal text-stone tabular-nums">{applications.length}</span>}
        </h2>
      </div>

      {/* Padded inside so a card's selected border and focus ring aren't clipped by the scrolling. */}
      <div className="scrollbar-none -m-1 snap-x snap-mandatory scroll-px-1 overflow-x-auto overscroll-x-contain p-1">
        <div role="radiogroup" aria-labelledby={labelId} className="flex w-max gap-2.5">
          {applications.map((application) => (
            <ApplicationCard
              key={application.id}
              application={application}
              selected={application.id === selectedId}
              onSelect={() => selectApplication(application.id)}
            />
          ))}
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
