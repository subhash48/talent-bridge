"use client";

import { ListChecks, LoaderCircle, Plus, X } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/Button";
import { FilterChip } from "@/components/ui/FilterChip";
import { Input } from "@/components/ui/Input";
import type { Shortlist } from "@/lib/candidate-query";
import { pluralize } from "@/lib/format";
import { SHORTLIST_SIZES, type MatchResult } from "@/types/matching";

type ShortlistPanelProps = {
  shortlist: Shortlist;
  onChange: (shortlist: Shortlist) => void;
  onClose: () => void;
  result: MatchResult | null;
  loading: boolean;
  error?: string;
  /** Skills candidates list, offered as criteria. */
  suggestions: string[];
};

/**
 * The recruiter's shortlist: the job-related criteria they choose and how many to show (5, 10, 20 or their
 * own number). The list below shows each candidate's evidence; nobody is scored, moved or contacted, and
 * the recruiter ticks who to act on.
 */
export function ShortlistPanel({ shortlist, onChange, onClose, result, loading, error, suggestions }: ShortlistPanelProps) {
  const inputId = useId();
  const listId = useId();
  const [draft, setDraft] = useState("");
  const [custom, setCustom] = useState(() => !(SHORTLIST_SIZES as readonly number[]).includes(shortlist.size));
  const [customValue, setCustomValue] = useState(custom ? String(shortlist.size) : "");
  const fromJob = result?.criteria_source === "job_requirements";

  function add(value: string) {
    const criterion = value.trim().replace(/\s+/g, " ");
    setDraft("");
    if (!criterion || shortlist.criteria.some((item) => item.toLowerCase() === criterion.toLowerCase())) return;
    onChange({ ...shortlist, criteria: [...shortlist.criteria, criterion].slice(0, 20) });
  }

  return (
    <section aria-label="Shortlist" className="mx-4 mt-3 flex animate-rise flex-col gap-3 rounded-[12px] border border-brand-ink/25 bg-brand-soft/60 p-3.5 sm:mx-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-medium text-ink">
          <ListChecks aria-hidden className="size-4 text-brand-ink" /> Shortlist
        </h3>
        <p className="text-xs text-stone">Job-related criteria you choose. No scores: you decide who to contact.</p>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close the shortlist" className="ml-auto">
          <X />
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-stone">Criteria:</span>
        <ul className="contents">
          {shortlist.criteria.map((criterion) => (
            <li key={criterion} className="inline-flex h-7 items-center gap-1 rounded-full bg-surface-raised pr-1 pl-2.5 text-xs text-ink ring-1 ring-ink/15">
              {criterion}
              <button
                type="button"
                onClick={() => onChange({ ...shortlist, criteria: shortlist.criteria.filter((item) => item !== criterion) })}
                aria-label={`Remove criterion ${criterion}`}
                className="flex size-5 items-center justify-center rounded-full text-stone hover:bg-ink/10 hover:text-ink"
              >
                <X aria-hidden className="size-3" />
              </button>
            </li>
          ))}
        </ul>
        {fromJob && shortlist.criteria.length === 0 && (
          <span className="text-xs text-charcoal">
            The job&apos;s listed requirements: {result.criteria.join(", ")}.{" "}
            <button type="button" onClick={() => onChange({ ...shortlist, criteria: result.criteria })} className="text-brand-ink underline-offset-2 hover:underline">
              Edit them
            </button>
          </span>
        )}
        <form
          className="flex items-center gap-1"
          onSubmit={(event) => {
            event.preventDefault();
            add(draft);
          }}
        >
          <label htmlFor={inputId} className="sr-only">
            Add a criterion, such as a skill
          </label>
          <Input
            id={inputId}
            list={listId}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Add a skill or requirement"
            maxLength={60}
            autoComplete="off"
            className="h-7 w-48 text-xs"
          />
          <datalist id={listId}>
            {suggestions.map((skill) => (
              <option key={skill} value={skill} />
            ))}
          </datalist>
          <Button type="submit" variant="secondary" size="icon-sm" aria-label="Add criterion" disabled={!draft.trim()} className="size-7">
            <Plus />
          </Button>
        </form>
      </div>

      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="How many to show">
        <span className="text-xs text-stone">Show:</span>
        {SHORTLIST_SIZES.map((size) => (
          <FilterChip
            key={size}
            active={!custom && shortlist.size === size}
            onClick={() => {
              setCustom(false);
              onChange({ ...shortlist, size });
            }}
            className="h-7 px-2.5 text-xs"
          >
            {size}
          </FilterChip>
        ))}
        <FilterChip
          active={custom}
          onClick={() => {
            const value = Number(customValue) || 15;
            setCustom(true);
            setCustomValue(String(value));
            onChange({ ...shortlist, size: value });
          }}
          className="h-7 px-2.5 text-xs"
        >
          Custom
        </FilterChip>
        {custom && (
          <Input
            type="number"
            min={1}
            max={200}
            value={customValue}
            onChange={(event) => {
              setCustomValue(event.target.value);
              const value = Math.round(Number(event.target.value));
              if (value >= 1 && value <= 200) onChange({ ...shortlist, size: value });
            }}
            aria-label="Custom number of candidates to show"
            className="h-7 w-20 text-xs"
          />
        )}
      </div>

      <p role="status" className="flex items-center gap-1.5 text-xs text-charcoal">
        {loading && <LoaderCircle aria-hidden className="size-3.5 animate-spin" />}
        {error ? (
          <span className="text-danger">{error}</span>
        ) : result ? (
          result.criteria.length ? (
            <>
              Showing {Math.min(result.items.length, result.limit)} of {pluralize(result.matching, "candidate")} who show at least one
              criterion, out of {result.considered} in view. {result.order}
            </>
          ) : (
            <>Add a criterion to see who shows it. Showing {Math.min(result.items.length, result.limit)} of {result.considered} in view.</>
          )
        ) : (
          "Finding matches…"
        )}
      </p>
    </section>
  );
}
