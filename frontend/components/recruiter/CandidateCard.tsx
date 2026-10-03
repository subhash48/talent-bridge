import { Avatar } from "@/components/shared/Avatar";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Card } from "@/components/ui/Card";
import type { DashboardRow } from "@/types/application";

export function CandidateCard({ row }: { row: DashboardRow }) {
  return (
    <Card className="flex items-center gap-4 p-4 transition hover:-translate-y-0.5 hover:shadow-raised">
      <Avatar name={row.candidate.name} src={row.candidate.avatar_url} size={40} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-ink">{row.candidate.name}</p>
        <p className="truncate text-sm text-stone">{row.job.title}</p>
      </div>
      <StatusBadge stage={row.stage} />
    </Card>
  );
}
