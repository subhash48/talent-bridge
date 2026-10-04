import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DemoJobEditor } from "@/components/recruiter/DemoJobEditor";
import { getDemoJob } from "@/services/demo-jobs";

type DemoJobPageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: DemoJobPageProps): Promise<Metadata> {
  const { id } = await params;
  const job = await getDemoJob(id);
  return { title: job ? `Edit ${job.title}` : "Demo job" };
}

export default async function DemoJobPage({ params }: DemoJobPageProps) {
  const { id } = await params;
  const job = await getDemoJob(id);
  if (!job) notFound();
  return <DemoJobEditor job={job} />;
}
