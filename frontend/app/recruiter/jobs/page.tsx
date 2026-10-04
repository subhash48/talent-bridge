import type { Metadata } from "next";

import { JobsBoard } from "@/components/recruiter/JobsBoard";
import { errorMessage } from "@/services/api";
import { listDemoJobs } from "@/services/demo-jobs";
import { getJobs } from "@/services/jobs";
import type { DemoJob } from "@/types/demo";

export const metadata: Metadata = { title: "Jobs" };

export default async function JobsPage() {
  const [jobs, demo] = await Promise.all([getJobs(), loadDemoJobs()]);
  return <JobsBoard jobs={jobs} demoJobs={demo.jobs} demoError={demo.error} />;
}

/** The development-only demo jobs. They never stop the Jobs page from loading: a failure shows in their section. */
async function loadDemoJobs(): Promise<{ jobs: DemoJob[] | null; error?: string }> {
  try {
    return { jobs: await listDemoJobs() };
  } catch (error) {
    return { jobs: [], error: errorMessage(error) };
  }
}
