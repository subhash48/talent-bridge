import type { Metadata } from "next";

import { CandidatesWorkspace } from "@/components/recruiter/CandidatesWorkspace";
import { viewFromParams, viewToParams } from "@/lib/candidate-query";
import { greetingFor } from "@/lib/format";

export const metadata: Metadata = { title: "Candidates" };

type CandidatesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CandidatesPage({ searchParams }: CandidatesPageProps) {
  const params = await searchParams;
  const single = new URLSearchParams(
    Object.entries(params).flatMap(([key, value]) => (typeof value === "string" ? [[key, value]] : [])),
  );
  const { candidate } = params;
  const view = viewFromParams(single);
  return (
    <CandidatesWorkspace
      // A link with other filters (from the AI Assistant, say) starts the page again with them; a new
      // ?candidate= alone just opens that candidate.
      key={viewToParams(view).toString()}
      greeting={greetingFor()}
      initialCandidateId={typeof candidate === "string" ? candidate : undefined}
      initialView={view}
    />
  );
}
