"use client";

import { CandidateActionsMenu } from "@/components/recruiter/CandidateActionsMenu";
import { MatchEvidence } from "@/components/recruiter/MatchEvidence";
import { Avatar } from "@/components/shared/Avatar";
import { CommunicationBadge } from "@/components/recruiter/communication/CommunicationBadge";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Checkbox } from "@/components/ui/Checkbox";
import { cn } from "@/lib/utils";
import type { CandidateMatch } from "@/types/matching";
import type { PipelineCandidate } from "@/types/workspace";

export type CandidateSelectionProps = {
  candidate: PipelineCandidate;
  selected: boolean;
  checked: boolean;
  onSelect: (id: string) => void;
  onCheckedChange: (id: string, checked: boolean) => void;
  /** On the shortlist: why they match. */
  match?: CandidateMatch;
};

const cell = (className?: string) =>
  cn(
    "border-b border-border py-2 align-middle transition-colors duration-150 group-hover:bg-ink/[0.04] group-data-[selected]:border-transparent group-data-[selected]:bg-brand-soft first:rounded-l-[10px] last:rounded-r-[10px]",
    className,
  );

/** Whole row selects the candidate; the name is the keyboard target. Checkbox and menu don't select. */
export function CandidateRow({ candidate, selected, checked, onSelect, onCheckedChange, match }: CandidateSelectionProps) {
  return (
    <tr data-selected={selected || undefined} onClick={() => onSelect(candidate.id)} className="group cursor-pointer">
      <td className={cell("w-10 pl-3")} onClick={(event) => event.stopPropagation()}>
        <Checkbox
          checked={checked}
          onCheckedChange={(value) => onCheckedChange(candidate.id, value === true)}
          aria-label={`Select ${candidate.name}`}
        />
      </td>
      <td className={cell("pr-3")}>
        <div className="flex items-center gap-3">
          <Avatar name={candidate.name} src={candidate.avatarUrl} size={36} />
          <div className="min-w-0">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onSelect(candidate.id);
              }}
              aria-current={selected || undefined}
              className="block max-w-full truncate rounded-sm text-left text-sm leading-[18px] font-medium text-ink"
            >
              {candidate.name}
            </button>
            <p className="truncate text-[13px] leading-[18px] text-stone @[44rem]:hidden">{candidate.role}</p>
            {match && <MatchEvidence match={match} className="mt-1.5" />}
          </div>
        </div>
      </td>
      <td className={cell("hidden pr-3 text-sm text-stone @[44rem]:table-cell")}>{candidate.role}</td>
      <td className={cell("pr-3")}>
        <StatusBadge stage={candidate.stage} className="min-w-[88px]" />
      </td>
      <td className={cell("pr-2 text-[13px] leading-[18px]")}>
        <CommunicationCell candidate={candidate} />
      </td>
      <td className={cell("w-10 pr-2 text-right")}>
        <CandidateActionsMenu candidate={candidate} />
      </td>
    </tr>
  );
}

/** Whether they're hearing from us on time, and when they last did. */
export function CommunicationCell({ candidate }: { candidate: PipelineCandidate }) {
  const { status, reason, lastUpdateAt } = candidate.communication;
  return (
    <div className="flex flex-col items-start gap-1">
      <CommunicationBadge status={status} />
      <p className="line-clamp-1 text-[13px] text-stone">
        {reason ? (
          <span className="text-caution">{reason}</span>
        ) : lastUpdateAt ? (
          <>
            Last update <RelativeTime iso={lastUpdateAt} />
          </>
        ) : (
          "No update yet"
        )}
      </p>
    </div>
  );
}
