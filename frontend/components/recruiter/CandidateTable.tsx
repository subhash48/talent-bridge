import { Avatar } from "@/components/shared/Avatar";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import type { DashboardRow } from "@/types/application";
import { ENGAGEMENT_LABELS } from "@/types/event";

const COLUMNS = ["Candidate", "Role", "Stage", "Last activity", "Engagement", "Next action"];

export function CandidateTable({ rows }: { rows: DashboardRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="No candidates yet"
        description="Candidates appear here as they apply or are added."
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-[14px] border border-border bg-surface-raised shadow-soft">
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-stone">
          <tr>
            {COLUMNS.map((column) => (
              <th key={column} className="px-4 py-3 font-medium">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.application_id} className="border-t border-border">
              <td className="px-4 py-3">
                <div className="flex items-center gap-3 text-ink">
                  <Avatar name={row.candidate.name} src={row.candidate.avatar_url} />
                  {row.candidate.name}
                </div>
              </td>
              <td className="px-4 py-3 text-stone">{row.job.title}</td>
              <td className="px-4 py-3">
                <StatusBadge stage={row.stage} />
              </td>
              <td className="px-4 py-3 text-stone">{row.last_activity?.label ?? "—"}</td>
              <td className="px-4 py-3">{ENGAGEMENT_LABELS[row.engagement.level]}</td>
              <td className="px-4 py-3">{row.next_action.label}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
