"use client";

import { ArrowUpRight, ListFilter } from "lucide-react";
import Link from "next/link";

import { Frame } from "@/components/recruiter/assistant/CardFrame";
import { MatchEvidence } from "@/components/recruiter/MatchEvidence";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { buttonStyles } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { pluralize } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CandidateMatchCard } from "@/types/assistant";

type CandidateMatchListProps = {
  card: CandidateMatchCard;
  /** The recruiter's ticks: what "these candidates" means next. */
  onSelect: (ids: string[]) => void;
  /** An older list: still readable, its ticks follow the latest. */
  superseded?: boolean;
};

/**
 * A candidate list from the assistant: every filter behind it as a chip, the criteria, each candidate's
 * evidence, and a checkbox the recruiter ticks themselves. "Open in Candidates" shows the same list there.
 */
export function CandidateMatchList({ card, onSelect, superseded = false }: CandidateMatchListProps) {
  const selected = new Set(card.selected);
  const toggle = (id: string, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(id);
    else next.delete(id);
    onSelect([...next]);
  };
  const link = card.selected.length ? `${card.href}&select=${card.selected.join("|")}` : card.href;

  return (
    <Frame label={`${card.title} · ${card.items.length} of ${card.criteria.length ? card.matching : card.considered}`}>
      <div className="mt-2 flex flex-wrap items-center gap-1.5" aria-label="Filters behind this list">
        <ListFilter aria-hidden className="size-3.5 text-stone" />
        {card.filters.length === 0 && <span className="text-xs text-stone">Every active candidate</span>}
        {card.filters.map((filter) => (
          <span key={filter.key} className="inline-flex h-6 items-center rounded-full bg-brand-soft px-2.5 text-xs text-ink ring-1 ring-brand-ink/25">
            {filter.label}
          </span>
        ))}
        {card.criteria.length > 0 && (
          <span className="text-xs text-charcoal">
            Criteria{card.criteria_source === "job_requirements" ? " (the job's listed requirements)" : ""}: {card.criteria.join(", ")}
          </span>
        )}
      </div>
      {card.items.length > 0 ? (
        <ul className={cn("mt-2 divide-y divide-border", superseded && "opacity-80")}>
          {card.items.map((item) => (
            <li key={item.application_id} className="flex items-start gap-2.5 py-2.5">
              <Checkbox
                className="mt-0.5"
                checked={selected.has(item.application_id)}
                onCheckedChange={(value) => toggle(item.application_id, value === true)}
                aria-label={`Select ${item.name}`}
              />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Link href={`/recruiter/candidates/${item.application_id}`} className="text-sm font-medium text-ink hover:underline">
                    {item.name}
                  </Link>
                  <span className="text-xs text-stone">
                    {item.job_title} · {item.company_name}
                    {item.location && ` · ${item.location}`}
                  </span>
                  <StatusBadge stage={item.stage} />
                </p>
                {(item.evidence.length > 0 || item.experience) && <MatchEvidence match={item} className="mt-1" />}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-stone">Nobody in view fits these filters.</p>
      )}
      <p className="mt-2 text-[11px] text-faint">
        {card.order} {selected.size > 0 ? `${pluralize(selected.size, "candidate")} selected.` : "Tick who to act on."}
      </p>
      <Link href={link} className={cn(buttonStyles({ variant: "secondary", size: "sm" }), "mt-3")}>
        <ArrowUpRight aria-hidden /> Open in Candidates
      </Link>
    </Frame>
  );
}
