import type { Metadata } from "next";

import { CandidatesWorkspace } from "@/components/recruiter/CandidatesWorkspace";
import { greetingFor } from "@/lib/format";
import { getDashboardSummary } from "@/services/candidates";

export const metadata: Metadata = { title: "Candidates" };

type CandidatesPageProps = {
  searchParams: Promise<{ candidate?: string | string[] }>;
};

export default async function CandidatesPage({ searchParams }: CandidatesPageProps) {
  const [{ candidate }, summary] = await Promise.all([searchParams, getDashboardSummary()]);
  return (
    <CandidatesWorkspace
      greeting={greetingFor()}
      trends={summary.trends}
      initialCandidateId={typeof candidate === "string" ? candidate : undefined}
    />
  );
}
