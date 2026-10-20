import type { Metadata } from "next";

import { InterviewPrep } from "@/components/candidate/PrepView";
import { isUuid } from "@/lib/selected-application";

export const metadata: Metadata = { title: "Interview Prep" };

type PrepPageProps = { searchParams: Promise<{ interview?: string | string[] }> };

// Prep comes from the AI provider, which can be slow, so it loads in the browser behind a skeleton.
// ?interview= opens prep for that interview, and the portal switches to its application.
export default async function InterviewPrepPage({ searchParams }: PrepPageProps) {
  const { interview } = await searchParams;
  return <InterviewPrep interviewId={typeof interview === "string" && isUuid(interview) ? interview : undefined} />;
}
