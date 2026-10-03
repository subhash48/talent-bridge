import type { Metadata } from "next";

import { CandidateProfile } from "@/components/recruiter/CandidateProfile";
import { getCandidate } from "@/services/candidates";

type CandidatePageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: CandidatePageProps): Promise<Metadata> {
  const { id } = await params;
  const candidate = await getCandidate(id);
  return { title: candidate?.name ?? "Candidate" };
}

export default async function CandidatePage({ params }: CandidatePageProps) {
  const { id } = await params;
  return <CandidateProfile candidateId={id} />;
}
