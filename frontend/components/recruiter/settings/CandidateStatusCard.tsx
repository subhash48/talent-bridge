import { ArrowRight, EyeOff } from "lucide-react";

import { Card } from "@/components/ui/Card";

// backend/app/services/candidate_visibility.py: the status a candidate sees for each internal stage.
const MAPPING: { internal: string; candidate: string }[] = [
  { internal: "Sourced", candidate: "Applied" },
  { internal: "Screening", candidate: "Screening" },
  { internal: "Interview", candidate: "Interview" },
  { internal: "Offer", candidate: "Offer" },
  { internal: "Hired", candidate: "Hired" },
  { internal: "Rejected", candidate: "No longer under consideration" },
  { internal: "Archived after they withdrew", candidate: "Withdrawn" },
  { internal: "Any stage, once the role closes", candidate: "Role closed" },
];

/** What candidates see for each internal stage. Read-only: the mapping is part of the privacy boundary. */
export function CandidateStatusCard() {
  return (
    <Card>
      <h2 className="flex items-center gap-2 text-sm font-medium text-stone">
        <EyeOff aria-hidden className="size-4" /> What candidates see
      </h2>
      <p className="mt-1.5 text-sm leading-relaxed text-stone">
        Candidates see a plain status, never your internal stage names, notes, interview feedback, scores or the reasons
        for a decision.
      </p>
      <dl className="mt-4 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 text-sm">
        <dt className="text-xs text-faint">Your stage</dt>
        <span aria-hidden />
        <dd className="text-xs text-faint">They see</dd>
        {MAPPING.map((row) => (
          <div key={row.internal} className="contents">
            <dt className="text-charcoal">{row.internal}</dt>
            <ArrowRight aria-hidden className="size-3.5 text-faint" />
            <dd className="font-medium text-ink">{row.candidate}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
