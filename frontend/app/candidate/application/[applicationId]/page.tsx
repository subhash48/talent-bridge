import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ApplicationView } from "@/components/candidate/ApplicationView";
import { isApplicationId } from "@/lib/selected-application";
import { ApiError } from "@/services/api";
import { getCandidateApplication } from "@/services/portal";

export const metadata: Metadata = { title: "My Application" };

// One of the candidate's applications. The API answers 404 for anyone else's, so editing the address
// can't show another candidate's application.
export default async function ApplicationPage({ params }: { params: Promise<{ applicationId: string }> }) {
  const { applicationId } = await params;
  if (!isApplicationId(applicationId)) notFound();
  const detail = await getCandidateApplication(applicationId).catch((error: unknown) => {
    if (error instanceof ApiError && error.status === 404) notFound();
    return undefined; // the view loads it and shows a retry
  });
  return <ApplicationView key={applicationId} applicationId={applicationId} initialDetail={detail} />;
}
