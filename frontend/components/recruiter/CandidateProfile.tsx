"use client";

import { ArrowLeft, UserRoundX } from "lucide-react";
import Link from "next/link";

import { CandidateDetail } from "@/components/recruiter/CandidateDetail";
import { useWorkspace } from "@/components/recruiter/WorkspaceProvider";
import { EmptyState } from "@/components/shared/EmptyState";
import { buttonStyles } from "@/components/ui/Button";

/** /recruiter/candidates/[id]: the panel's content at full width, read from the shared workspace. */
export function CandidateProfile({ candidateId }: { candidateId: string }) {
  const { candidates } = useWorkspace();
  const candidate = candidates.find((item) => item.id === candidateId);

  return (
    <div className="flex flex-col gap-5 pt-1">
      <Link
        href={`/recruiter/candidates${candidate ? `?candidate=${candidate.id}` : ""}`}
        className="inline-flex w-fit items-center gap-2 rounded-sm text-sm text-stone transition-colors hover:text-ink"
      >
        <ArrowLeft aria-hidden className="size-4" /> Candidates
      </Link>
      {candidate ? (
        <CandidateDetail candidate={candidate} variant="page" />
      ) : (
        <EmptyState
          icon={UserRoundX}
          title="Candidate not found"
          description="They may have been archived, or the link is out of date."
          action={
            <Link href="/recruiter/candidates" className={buttonStyles({ variant: "secondary" })}>
              Back to candidates
            </Link>
          }
        />
      )}
    </div>
  );
}
