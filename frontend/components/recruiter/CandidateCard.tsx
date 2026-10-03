"use client";

import { CandidateActionsMenu } from "@/components/recruiter/CandidateActionsMenu";
import type { CandidateSelectionProps } from "@/components/recruiter/CandidateRow";
import { Avatar } from "@/components/shared/Avatar";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Checkbox } from "@/components/ui/Checkbox";

/** The table row's small-screen counterpart. */
export function CandidateCard({ candidate, selected, checked, onSelect, onCheckedChange, onAskAI }: CandidateSelectionProps) {
  return (
    <div
      data-selected={selected || undefined}
      className="flex items-start gap-3 rounded-[14px] px-3 py-3.5 transition-colors duration-150 hover:bg-white/[0.03] data-[selected]:bg-white/[0.065]"
    >
      <Checkbox
        className="mt-3"
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(candidate.id, value === true)}
        aria-label={`Select ${candidate.name}`}
      />
      <button
        type="button"
        onClick={() => onSelect(candidate.id)}
        aria-current={selected || undefined}
        className="flex min-w-0 flex-1 items-start gap-3 rounded-[10px] text-left"
      >
        <Avatar name={candidate.name} src={candidate.avatarUrl} size={42} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium text-ink">{candidate.name}</span>
          <span className="block truncate text-[13px] text-stone">{candidate.role}</span>
          <span className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <StatusBadge stage={candidate.stage} />
            <span className="flex items-center gap-1.5 text-xs text-stone">
              {candidate.followUp && <span aria-hidden className="size-1.5 rounded-full bg-amber-300" />}
              {candidate.lastActivity} · <RelativeTime iso={candidate.lastActivityAt} />
            </span>
          </span>
        </span>
      </button>
      <CandidateActionsMenu candidate={candidate} onAskAI={() => onAskAI(candidate.id)} />
    </div>
  );
}
