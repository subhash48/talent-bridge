import type { Metadata } from "next";

import { ApplicationView } from "@/components/candidate/ApplicationView";
import { getCandidateApplication } from "@/services/portal";

export const metadata: Metadata = { title: "My Application" };

export default async function MyApplicationPage() {
  // Rendered with data when the API answers; otherwise the view loads it and shows a retry.
  const detail = await getCandidateApplication().catch(() => undefined);
  return <ApplicationView initialDetail={detail} />;
}
