import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DemoJobEditor } from "@/components/recruiter/DemoJobEditor";
import { listDemoJobs } from "@/services/demo-jobs";

export const metadata: Metadata = { title: "New demo job" };

export default async function NewDemoJobPage() {
  // Demo jobs exist only while the API has the demo switched on (never in mock mode).
  if ((await listDemoJobs()) === null) notFound();
  return <DemoJobEditor />;
}
