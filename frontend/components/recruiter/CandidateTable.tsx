"use client";

import type { ReactNode } from "react";

import { CandidateCard } from "@/components/recruiter/CandidateCard";
import { CandidateRow } from "@/components/recruiter/CandidateRow";
import { Checkbox } from "@/components/ui/Checkbox";
import type { PipelineCandidate } from "@/types/workspace";

type CandidateTableProps = {
  candidates: PipelineCandidate[];
  selectedId?: string;
  checkedIds: ReadonlySet<string>;
  onSelect: (id: string) => void;
  onCheckedChange: (id: string, checked: boolean) => void;
  onCheckAll: (checked: boolean) => void;
  onAskAI: (id: string) => void;
  emptyState: ReactNode;
};

const headerCell = "border-b border-border pb-2.5 text-[13px] font-normal text-stone";

/** A table from md up, a card list below. Columns collapse with the panel's width, not the viewport. */
export function CandidateTable({
  candidates,
  selectedId,
  checkedIds,
  onSelect,
  onCheckedChange,
  onCheckAll,
  onAskAI,
  emptyState,
}: CandidateTableProps) {
  if (candidates.length === 0) return <div className="px-4 pb-5 sm:px-5">{emptyState}</div>;

  const checkedOnPage = candidates.filter((candidate) => checkedIds.has(candidate.id)).length;
  const headerState = checkedOnPage === 0 ? false : checkedOnPage === candidates.length ? true : "indeterminate";
  const rowProps = (candidate: PipelineCandidate) => ({
    candidate,
    selected: candidate.id === selectedId,
    checked: checkedIds.has(candidate.id),
    onSelect,
    onCheckedChange,
    onAskAI,
  });

  return (
    <div className="@container px-1 pb-2 sm:px-2">
      <table aria-labelledby="candidates-heading" className="hidden w-full border-separate border-spacing-0 text-left md:table">
        <thead>
          <tr>
            <th scope="col" className={`${headerCell} w-10 pl-3`}>
              <Checkbox
                checked={headerState}
                onCheckedChange={(value) => onCheckAll(value === true)}
                aria-label="Select all candidates on this page"
              />
            </th>
            <th scope="col" className={headerCell}>
              Candidate
            </th>
            <th scope="col" className={`${headerCell} hidden @[44rem]:table-cell`}>
              Role
            </th>
            <th scope="col" className={headerCell}>
              Stage
            </th>
            <th scope="col" className={headerCell}>
              Last activity
            </th>
            <th scope="col" className={`${headerCell} w-10`}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {candidates.map((candidate) => (
            <CandidateRow key={candidate.id} {...rowProps(candidate)} />
          ))}
        </tbody>
      </table>

      <ul aria-labelledby="candidates-heading" className="flex flex-col md:hidden">
        {candidates.map((candidate) => (
          <li key={candidate.id} className="border-b border-border last:border-0">
            <CandidateCard {...rowProps(candidate)} />
          </li>
        ))}
      </ul>
    </div>
  );
}
