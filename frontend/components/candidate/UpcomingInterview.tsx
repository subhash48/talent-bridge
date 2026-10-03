import { EmptyState } from "@/components/shared/EmptyState";
import { Card } from "@/components/ui/Card";
import type { PortalInterview } from "@/types/interview";

export function UpcomingInterview({ interview }: { interview: PortalInterview | null }) {
  if (!interview) {
    return (
      <EmptyState
        title="No upcoming interviews"
        description="When an interview is scheduled, the details appear here."
      />
    );
  }

  return (
    <Card>
      <p className="text-xs uppercase tracking-wide text-stone">Upcoming interview</p>
      <h2 className="mt-2 font-display text-3xl text-ink">{interview.title}</h2>
      <p className="mt-1 text-sm text-stone">{interview.duration_minutes} min</p>
      {interview.interviewers.length > 0 && (
        <p className="mt-4 text-sm text-charcoal">
          With {interview.interviewers.map((person) => person.name).join(", ")}
        </p>
      )}
      {/* TODO: Confirm and Prepare actions (ARCHITECTURE.md 4, 5.4) */}
    </Card>
  );
}
