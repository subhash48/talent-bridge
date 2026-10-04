"use client";

import { ChevronDown, ListFilter } from "lucide-react";

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
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import {
  EMPTY_FILTERS,
  SORT_OPTIONS,
  activeFilterCount,
  type CandidateFilters as Filters,
  type PortalFilter,
  type SortKey,
  type StageFilter,
} from "@/lib/candidate-query";
import { cn } from "@/lib/utils";
import { STAGE_LABELS } from "@/types/application";
import { ENGAGEMENT_LABELS, type EngagementLevel } from "@/types/event";
import { PIPELINE_STAGES } from "@/types/workspace";

const STAGE_CHIPS: { value: StageFilter; label: string }[] = [
  { value: "all", label: "All" },
  ...PIPELINE_STAGES.map((stage) => ({ value: stage, label: STAGE_LABELS[stage] })),
];

const ENGAGEMENT_LEVELS = Object.keys(ENGAGEMENT_LABELS) as EngagementLevel[];
const PORTAL_OPTIONS: { value: PortalFilter; label: string }[] = [
  { value: "active", label: "Portal activated" },
  { value: "invited", label: "Invited, not signed in yet" },
];

type CandidateFiltersProps = {
  stage: StageFilter;
  counts: Record<StageFilter, number>;
  onStageChange: (stage: StageFilter) => void;
  sort: SortKey;
  onSortChange: (sort: SortKey) => void;
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
  roles: string[];
};

export function CandidateFilters({
  stage,
  counts,
  onStageChange,
  sort,
  onSortChange,
  filters,
  onFiltersChange,
  roles,
}: CandidateFiltersProps) {
  const filterCount = activeFilterCount(filters);
  const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  const keepOpen = (event: Event) => event.preventDefault();

  return (
    <div className="flex flex-col gap-5 px-4 pt-5 sm:px-6 sm:pt-6">
      <div className="flex items-center justify-between gap-3">
        <h2 id="candidates-heading" className="text-2xl font-semibold tracking-tight text-ink sm:text-[26px]">
          Candidates
        </h2>
        <div className="flex items-center gap-2">
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
                className={cn("relative", filterCount > 0 && "border-white/25")}
                aria-label={filterCount ? `Filters, ${filterCount} active` : "Filters"}
              >
                <ListFilter />
                {filterCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-ink text-[11px] font-semibold text-canvas tabular-nums">
                    {filterCount}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="max-h-[min(70vh,var(--radix-dropdown-menu-content-available-height))] w-[240px] overflow-y-auto">
              <DropdownMenuCheckboxItem
                checked={filters.followUpOnly}
                onSelect={keepOpen}
                onCheckedChange={(checked) => onFiltersChange({ ...filters, followUpOnly: checked === true })}
              >
                Needs follow-up only
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={filters.recentlyActive}
                onSelect={keepOpen}
                onCheckedChange={(checked) => onFiltersChange({ ...filters, recentlyActive: checked === true })}
              >
                Active in the portal this week
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Candidate portal</DropdownMenuLabel>
              {PORTAL_OPTIONS.map((option) => (
                <DropdownMenuCheckboxItem
                  key={option.value}
                  checked={filters.portal.includes(option.value)}
                  onSelect={keepOpen}
                  onCheckedChange={() => onFiltersChange({ ...filters, portal: toggle(filters.portal, option.value) })}
                >
                  {option.label}
                </DropdownMenuCheckboxItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Engagement</DropdownMenuLabel>
              {ENGAGEMENT_LEVELS.map((level) => (
                <DropdownMenuCheckboxItem
                  key={level}
                  checked={filters.engagement.includes(level)}
                  onSelect={keepOpen}
                  onCheckedChange={() => onFiltersChange({ ...filters, engagement: toggle(filters.engagement, level) })}
                >
                  {ENGAGEMENT_LABELS[level]}
                </DropdownMenuCheckboxItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Role</DropdownMenuLabel>
              {roles.map((role) => (
                <DropdownMenuCheckboxItem
                  key={role}
                  checked={filters.roles.includes(role)}
                  onSelect={keepOpen}
                  onCheckedChange={() => onFiltersChange({ ...filters, roles: toggle(filters.roles, role) })}
                >
                  {role}
                </DropdownMenuCheckboxItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={filterCount === 0} onSelect={() => onFiltersChange(EMPTY_FILTERS)}>
                Clear filters
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div role="group" aria-label="Filter by stage" className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 sm:-mx-6 sm:px-6">
        {STAGE_CHIPS.map((chip) => (
          <FilterChip key={chip.value} active={stage === chip.value} onClick={() => onStageChange(chip.value)}>
            {chip.label} <span className="tabular-nums">({counts[chip.value]})</span>
          </FilterChip>
        ))}
      </div>
    </div>
  );
}
