import type { Metadata } from "next";

import { JobsBoard } from "@/components/recruiter/JobsBoard";
import { getJobs } from "@/services/jobs";

export const metadata: Metadata = { title: "Jobs" };

export default async function JobsPage() {
  const jobs = await getJobs();
  return <JobsBoard jobs={jobs} />;
}
