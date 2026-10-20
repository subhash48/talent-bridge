import type { Metadata } from "next";

import { InterviewPrep } from "@/components/candidate/PrepView";
import { isUuid } from "@/lib/selected-application";
import { getCandidateInterview } from "@/services/portal";

export const metadata: Metadata = { title: "Interview Prep" };

type PrepPageProps = { searchParams: Promise<{ interview?: string | string[] }> };

// Prep comes from the AI provider, which can be slow, so it loads in the browser behind a skeleton.
// ?interview= opens prep for that interview, and the portal switches to its application. Which
// application that is comes from the interview itself (a quick read), so the switch needn't wait for the prep.
export default async function InterviewPrepPage({ searchParams }: PrepPageProps) {
  const { interview } = await searchParams;
  const interviewId = typeof interview === "string" && isUuid(interview) ? interview : undefined;
  const opened = interviewId ? await getCandidateInterview(interviewId).catch(() => undefined) : undefined;
  return <InterviewPrep interviewId={interviewId} interviewApplicationId={opened?.applicationId} />;
}
