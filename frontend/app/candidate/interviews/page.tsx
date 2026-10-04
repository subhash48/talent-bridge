import type { Metadata } from "next";

import { CandidateInterviews } from "@/components/candidate/InterviewsView";
import { selectedApplicationId } from "@/lib/selected-application-server";
import { getCandidateInterviews } from "@/services/portal";

export const metadata: Metadata = { title: "Interviews" };

export default async function CandidateInterviewsPage() {
  const applicationId = await selectedApplicationId();
  const interviews = await getCandidateInterviews(applicationId).catch(() => undefined);
  return <CandidateInterviews renderedFor={applicationId ?? null} initialInterviews={interviews} />;
}
