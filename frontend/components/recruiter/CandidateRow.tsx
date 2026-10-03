"use client";

import { CandidateActionsMenu } from "@/components/recruiter/CandidateActionsMenu";
import { Avatar } from "@/components/shared/Avatar";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Checkbox } from "@/components/ui/Checkbox";
import { cn } from "@/lib/utils";
import type { PipelineCandidate } from "@/types/workspace";

export type CandidateSelectionProps = {
  candidate: PipelineCandidate;
  selected: boolean;
  checked: boolean;
  onSelect: (id: string) => void;
  onCheckedChange: (id: string, checked: boolean) => void;
  onAskAI: (id: string) => void;
};

const cell = (className?: string) =>
  cn(
    "border-b border-border py-3 align-middle transition-colors duration-150 group-hover:bg-white/[0.025] group-data-[selected]:border-transparent group-data-[selected]:bg-white/[0.065] first:rounded-l-[12px] last:rounded-r-[12px]",
    className,
  );

/** Whole row selects the candidate; the name is the keyboard target. Checkbox and menu don't select. */
export function CandidateRow({ candidate, selected, checked, onSelect, onCheckedChange, onAskAI }: CandidateSelectionProps) {
  return (
    <tr data-selected={selected || undefined} onClick={() => onSelect(candidate.id)} className="group cursor-pointer">
      <td className={cell("w-12 pl-3")} onClick={(event) => event.stopPropagation()}>
        <Checkbox
          checked={checked}
          onCheckedChange={(value) => onCheckedChange(candidate.id, value === true)}
          aria-label={`Select ${candidate.name}`}
        />
      </td>
      <td className={cell("pr-3")}>
        <div className="flex items-center gap-3">
          <Avatar name={candidate.name} src={candidate.avatarUrl} size={44} />
          <div className="min-w-0">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onSelect(candidate.id);
              }}
              aria-current={selected || undefined}
              className="block max-w-full truncate rounded-sm text-left text-[15px] font-medium text-ink"
            >
              {candidate.name}
            </button>
            <p className="truncate text-[13px] text-stone @[44rem]:hidden">{candidate.role}</p>
          </div>
        </div>
      </td>
      <td className={cell("hidden pr-3 text-sm text-stone @[44rem]:table-cell")}>{candidate.role}</td>
      <td className={cell("pr-3")}>
        <StatusBadge stage={candidate.stage} className="min-w-[96px]" />
      </td>
      <td className={cell("pr-2")}>
        <p className="flex items-center gap-1.5 text-sm text-charcoal">
          {candidate.followUp && (
            <span className="size-1.5 shrink-0 rounded-full bg-amber-300" title={candidate.followUp.reason}>
              <span className="sr-only">Needs follow-up:</span>
            </span>
          )}
          <span className="line-clamp-1">{candidate.lastActivity}</span>
        </p>
        <RelativeTime iso={candidate.lastActivityAt} className="text-[13px] text-stone" />
      </td>
      <td className={cell("w-12 pr-2 text-right")}>
        <CandidateActionsMenu candidate={candidate} onAskAI={() => onAskAI(candidate.id)} />
      </td>
    </tr>
  );
}
