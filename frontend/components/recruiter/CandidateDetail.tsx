import { EngagementPanel } from "@/components/recruiter/EngagementPanel";
import { Card } from "@/components/ui/Card";

const SECTIONS = [
  "Next action",
  "Next interview",
  "Recent activity",
  "Messages",
  "Interview history",
  "Documents",
  "Recruiter notes",
  "AI summary",
];

// Shared by the side panel and /recruiter/candidates/[id] (ARCHITECTURE.md 3.1, 12.1).
export function CandidateDetail({ candidateId }: { candidateId: string }) {
  return (
    <div data-candidate-id={candidateId} className="grid gap-6 lg:grid-cols-[2fr_1fr]">
      <div className="flex flex-col gap-4">
        {SECTIONS.map((section) => (
          <Card key={section}>
            <h2 className="text-sm font-medium text-ink">{section}</h2>
            <p className="mt-2 text-sm text-stone">Not loaded yet.</p>
          </Card>
        ))}
      </div>
      <EngagementPanel level="insufficient" signals={[]} />
    </div>
  );
}
