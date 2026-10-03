import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { JobPipeline } from "@/components/recruiter/JobPipeline";
import { getJob } from "@/services/jobs";

type JobPageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: JobPageProps): Promise<Metadata> {
  const { id } = await params;
  const job = await getJob(id);
  return { title: job?.title ?? "Job" };
}

export default async function JobPage({ params }: JobPageProps) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) notFound();
  return <JobPipeline job={job} />;
}
