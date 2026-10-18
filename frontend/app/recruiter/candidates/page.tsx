import type { Metadata } from "next";

import { CandidatesWorkspace } from "@/components/recruiter/CandidatesWorkspace";
import { greetingFor } from "@/lib/format";

export const metadata: Metadata = { title: "Candidates" };

type CandidatesPageProps = {
  searchParams: Promise<{ candidate?: string | string[] }>;
};

export default async function CandidatesPage({ searchParams }: CandidatesPageProps) {
  const { candidate } = await searchParams;
  return (
    <CandidatesWorkspace
      greeting={greetingFor()}
      initialCandidateId={typeof candidate === "string" ? candidate : undefined}
    />
  );
}
