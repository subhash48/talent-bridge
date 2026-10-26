import type { Metadata } from "next";

import { HireJobs } from "@/components/hire/HireJobs";

export const metadata: Metadata = { title: "Jobs" };

export default function HireJobsPage() {
  return <HireJobs />;
}
