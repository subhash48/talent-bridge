import type { Metadata } from "next";

import { InterviewsView } from "@/components/candidate/InterviewsView";
import { getCandidateInterviews } from "@/services/portal";

export const metadata: Metadata = { title: "Interviews" };

export default async function CandidateInterviewsPage() {
  const interviews = await getCandidateInterviews().catch(() => undefined);
  return <InterviewsView initialInterviews={interviews} />;
}
