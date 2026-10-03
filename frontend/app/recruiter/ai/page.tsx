import type { Metadata } from "next";

import { RecruiterAI } from "@/components/recruiter/RecruiterAI";

export const metadata: Metadata = { title: "AI Assistant" };

type AIPageProps = { searchParams: Promise<{ candidate?: string | string[] }> };

export default async function RecruiterAIPage({ searchParams }: AIPageProps) {
  const { candidate } = await searchParams;
  return <RecruiterAI initialCandidateId={typeof candidate === "string" ? candidate : undefined} />;
}
