"use client";

import { ChevronDown, X } from "lucide-react";

import { useBoard } from "@/components/jobs/BoardNavigation";
import {
  ARRANGEMENTS,
  EMPLOYMENT_TYPES,
  POSTED,
  SALARIES,
  activeFilterCount,
  choiceLabel,
  choiceSummary,
  withChanges,
  withoutFilters,
} from "@/components/jobs/board";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import { cn } from "@/lib/utils";

type Choice<T extends string> = { value: T; label: string };

// 44px tall, for a thumb. A chosen filter turns cobalt-tinted and says what's chosen.
const TRIGGER =
  "inline-flex h-11 items-center gap-2 rounded-full border px-4 text-[14px] font-medium whitespace-nowrap transition-colors data-[state=open]:border-brand/60 [&_svg]:size-4 [&_svg]:shrink-0";
const IDLE = "border-ink/12 bg-white/40 text-ink hover:border-ink/25 hover:bg-white/60";
const ACTIVE = "border-brand/35 bg-accent-soft text-brand-ink hover:border-brand/55";
// Roomier than a workspace menu's rows: these are picked on phones too.
const ITEM = "h-10 text-[14px]";

/** Work arrangement, employment type, salary and date posted; each change updates the URL and the results. */
export function BoardFilters({ className }: { className?: string }) {
  const { query, go } = useBoard();
  const count = activeFilterCount(query);

  return (
    <div role="group" aria-label="Filters" className={cn("flex flex-wrap items-center gap-2", className)}>
      <MultiFilter
        label="Work arrangement"
        choices={ARRANGEMENTS}
        values={query.arrangement}
        onChange={(arrangement) => go(withChanges(query, { arrangement }))}
      />
      <MultiFilter
        label="Employment type"
        choices={EMPLOYMENT_TYPES}
        values={query.type}
        onChange={(type) => go(withChanges(query, { type }))}
      />
      <SingleFilter
        label="Salary"
        anyLabel="Any"
        choices={SALARIES}
        value={query.salary}
        onChange={(salary) => go(withChanges(query, { salary }))}
      />
      <SingleFilter
        label="Date posted"
        anyLabel="Any time"
        choices={POSTED}
        value={query.posted}
        onChange={(posted) => go(withChanges(query, { posted }))}
      />
      <button
        type="button"
        onClick={() => go(withoutFilters(query))}
        disabled={count === 0}
        className="inline-flex h-11 items-center gap-1.5 rounded-full px-3 text-[14px] font-medium text-brand-ink transition-colors hover:bg-ink/[0.05] hover:text-ink disabled:pointer-events-none disabled:text-stone/70"
      >
        <X aria-hidden className="size-4" />
        Clear filters
      </button>
    </div>
  );
}

type MultiFilterProps<T extends string> = {
  label: string;
  choices: readonly Choice<T>[];
  values: readonly T[];
  onChange: (values: T[]) => void;
};

/** Any number of choices; the menu stays open so several can be ticked in a row. */
function MultiFilter<T extends string>({ label, choices, values, onChange }: MultiFilterProps<T>) {
  const summary = choiceSummary(values, choices);

  function toggle(value: T, checked: boolean) {
    const next = new Set(values);
    if (checked) next.add(value);
    else next.delete(value);
    onChange(choices.filter((choice) => next.has(choice.value)).map((choice) => choice.value));
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn(TRIGGER, summary ? ACTIVE : IDLE)}>
        {summary ? (
          <>
            <span className="sr-only">{label}: </span>
            {summary}
          </>
        ) : (
          label
        )}
        <ChevronDown aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" aria-label={label} className="min-w-[210px]">
        {choices.map((choice) => (
          <DropdownMenuCheckboxItem
            key={choice.value}
            checked={values.includes(choice.value)}
            onCheckedChange={(checked) => toggle(choice.value, checked === true)}
            onSelect={(event) => event.preventDefault()}
            className={ITEM}
          >
            {choice.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type SingleFilterProps<T extends string> = {
  label: string;
  anyLabel: string;
  choices: readonly Choice<T>[];
  value: T | null;
  onChange: (value: T | null) => void;
};

const ANY = "any";

/** One choice, or none ("Any"). */
function SingleFilter<T extends string>({ label, anyLabel, choices, value, onChange }: SingleFilterProps<T>) {
  const summary = choiceLabel(value, choices);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn(TRIGGER, summary ? ACTIVE : IDLE)}>
        {summary ? (
          <>
            <span className="sr-only">{label}: </span>
            {summary}
          </>
        ) : (
          label
        )}
        <ChevronDown aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" aria-label={label} className="min-w-[200px]">
        <DropdownMenuRadioGroup
          value={value ?? ANY}
          onValueChange={(next) => onChange(choices.find((choice) => choice.value === next)?.value ?? null)}
        >
          <DropdownMenuRadioItem value={ANY} className={ITEM}>
            {anyLabel}
          </DropdownMenuRadioItem>
          {choices.map((choice) => (
            <DropdownMenuRadioItem key={choice.value} value={choice.value} className={ITEM}>
              {choice.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
