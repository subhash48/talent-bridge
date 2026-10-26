"use client";

import { ChevronDown, ListChecks, ListFilter, X } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { FilterChip } from "@/components/ui/FilterChip";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import {
  APPLIED_OPTIONS,
  COMMUNICATION_OPTIONS,
  EMPTY_FILTERS,
  INTERVIEW_OPTIONS,
  MESSAGING_OPTIONS,
  PORTAL_OPTIONS,
  SORT_OPTIONS,
  activeFilterCount,
  describeFilters,
  type AppliedFilter,
  type CandidateFilters as Filters,
  type JobOption,
  type SortKey,
  type StageFilter,
} from "@/lib/candidate-query";
import { cn } from "@/lib/utils";
import { STAGE_LABELS } from "@/types/application";
import { PIPELINE_STAGES } from "@/types/workspace";

const STAGE_CHIPS: { value: StageFilter; label: string }[] = [
  { value: "all", label: "All" },
  ...PIPELINE_STAGES.map((stage) => ({ value: stage, label: STAGE_LABELS[stage] })),
];

type CandidateFiltersProps = {
  stage: StageFilter;
  counts: Record<StageFilter, number>;
  onStageChange: (stage: StageFilter) => void;
  sort: SortKey;
  onSortChange: (sort: SortKey) => void;
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
  /** The search box's words, shown as a chip too. */
  query: string;
  onClearQuery: () => void;
  jobs: JobOption[];
  skills: string[];
  locations: string[];
  shortlistOpen: boolean;
  /** Open or close the shortlist: candidates against job-related criteria the recruiter picks. */
  onShortlist: () => void;
};

export function CandidateFilters({
  stage,
  counts,
  onStageChange,
  sort,
  onSortChange,
  filters,
  onFiltersChange,
  query,
  onClearQuery,
  jobs,
  skills,
  locations,
  shortlistOpen,
  onShortlist,
}: CandidateFiltersProps) {
  const filterCount = activeFilterCount(filters);
  const active = describeFilters(filters, jobs);
  const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  const keepOpen = (event: Event) => event.preventDefault();

  function checklist<K extends "jobs" | "skills" | "locations" | "interview" | "communication" | "messaging" | "portal">(
    key: K,
    options: { value: Filters[K][number]; label: string }[],
  ) {
    const selected = filters[key] as string[];
    return options.map((option) => (
      <DropdownMenuCheckboxItem
        key={option.value}
        checked={selected.includes(option.value)}
        onSelect={keepOpen}
        onCheckedChange={() => onFiltersChange({ ...filters, [key]: toggle(selected, option.value) })}
      >
        {option.label}
      </DropdownMenuCheckboxItem>
    ));
  }

  const count = (list: unknown[]) => (list.length ? <span className="ml-auto pl-3 text-xs text-brand-ink tabular-nums">{list.length}</span> : null);
  const submenu = "max-h-[min(60vh,var(--radix-dropdown-menu-content-available-height))] w-[248px] overflow-y-auto";

  return (
    <div className="flex flex-col gap-4 px-4 pt-4 sm:px-5 sm:pt-5">
      <div className="flex items-center justify-between gap-3">
        <h2 id="candidates-heading" className="text-[15px] font-semibold tracking-tight text-ink sm:text-base">
          Candidates
        </h2>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            className={cn("px-3.5", shortlistOpen && "border-brand-ink/45 bg-brand-soft")}
            aria-pressed={shortlistOpen}
            onClick={onShortlist}
          >
            <ListChecks /> <span className="hidden sm:inline">Shortlist</span>
            <span className="sr-only sm:hidden">Shortlist</span>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" className="px-3.5" aria-label={`Sort: ${SORT_OPTIONS.find((option) => option.value === sort)?.label}`}>
                <span className="hidden sm:inline">{SORT_OPTIONS.find((option) => option.value === sort)?.label}</span>
                <span className="sm:hidden">Sort</span>
                <ChevronDown className="text-stone" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>Sort by</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={sort} onValueChange={(value) => onSortChange(value as SortKey)}>
                {SORT_OPTIONS.map((option) => (
                  <DropdownMenuRadioItem key={option.value} value={option.value}>
                    {option.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="secondary"
                size="icon"
                className={cn("relative", filterCount > 0 && "border-brand-ink/45")}
                aria-label={filterCount ? `Filters, ${filterCount} active` : "Filters"}
              >
                <ListFilter />
                {filterCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 flex size-[18px] items-center justify-center rounded-full bg-brand text-[11px] font-semibold text-on-brand tabular-nums">
                    {filterCount}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-[232px]">
              <DropdownMenuLabel>Filter by</DropdownMenuLabel>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Job {count(filters.jobs)}</DropdownMenuSubTrigger>
                <DropdownMenuSubContent className={submenu}>
                  {jobs.length ? checklist("jobs", jobs.map((job) => ({ value: job.id, label: job.label }))) : <Empty />}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Skills {count(filters.skills)}</DropdownMenuSubTrigger>
                <DropdownMenuSubContent className={submenu}>
                  <DropdownMenuLabel>Has every skill ticked</DropdownMenuLabel>
                  {skills.length ? checklist("skills", skills.map((skill) => ({ value: skill, label: skill }))) : <Empty />}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Location {count(filters.locations)}</DropdownMenuSubTrigger>
                <DropdownMenuSubContent className={submenu}>
                  {locations.length ? checklist("locations", locations.map((place) => ({ value: place, label: place }))) : <Empty />}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  Application date {filters.applied !== "any" && <span className="ml-auto pl-3 text-xs text-brand-ink">1</span>}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className={submenu}>
                  <DropdownMenuRadioGroup
                    value={filters.applied}
                    onValueChange={(value) => onFiltersChange({ ...filters, applied: value as AppliedFilter })}
                  >
                    {APPLIED_OPTIONS.map((option) => (
                      <DropdownMenuRadioItem key={option.value} value={option.value} onSelect={keepOpen}>
                        {option.label}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Interview status {count(filters.interview)}</DropdownMenuSubTrigger>
                <DropdownMenuSubContent className={submenu}>{checklist("interview", INTERVIEW_OPTIONS)}</DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Communication {count(filters.communication)}</DropdownMenuSubTrigger>
                <DropdownMenuSubContent className={submenu}>{checklist("communication", COMMUNICATION_OPTIONS)}</DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Candidate messaging {count(filters.messaging)}</DropdownMenuSubTrigger>
                <DropdownMenuSubContent className={submenu}>{checklist("messaging", MESSAGING_OPTIONS)}</DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Candidate portal {count(filters.portal)}</DropdownMenuSubTrigger>
                <DropdownMenuSubContent className={submenu}>{checklist("portal", PORTAL_OPTIONS)}</DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={filterCount === 0} onSelect={() => onFiltersChange(EMPTY_FILTERS)}>
                Clear filters
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div role="group" aria-label="Filter by stage" className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
        {STAGE_CHIPS.map((chip) => (
          <FilterChip key={chip.value} active={stage === chip.value} onClick={() => onStageChange(chip.value)}>
            {chip.label} <span className="tabular-nums">({counts[chip.value]})</span>
          </FilterChip>
        ))}
      </div>

      {(active.length > 0 || query.trim()) && (
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Filters in use">
          <span className="text-xs text-stone">Showing only:</span>
          <ul className="contents">
            {query.trim() && <ActiveChip label={`Search: “${query.trim()}”`} onRemove={onClearQuery} />}
            {active.map((filter) => (
              <ActiveChip key={filter.key} label={filter.label} onRemove={() => onFiltersChange(filter.remove(filters))} />
            ))}
          </ul>
          {active.length > 1 && (
            <button type="button" onClick={() => onFiltersChange(EMPTY_FILTERS)} className="rounded-sm px-1 text-xs text-brand-ink hover:text-ink">
              Clear filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ActiveChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <li className="inline-flex h-7 items-center gap-1 rounded-full bg-brand-soft pr-1 pl-2.5 text-xs text-ink ring-1 ring-brand-ink/25">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove filter ${label}`}
        className="flex size-5 items-center justify-center rounded-full text-stone transition-colors hover:bg-ink/10 hover:text-ink"
      >
        <X aria-hidden className="size-3" />
      </button>
    </li>
  );
}

function Empty() {
  return <p className="px-2 py-1.5 text-[13px] text-stone">Nothing to filter by yet.</p>;
}
