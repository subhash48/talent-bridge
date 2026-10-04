import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { CareerJobView } from "@/components/careers/CareerJobView";
import { CareersUnavailable } from "@/components/careers/CareersNotices";
import { errorMessage } from "@/services/api";
import { getCareerJob } from "@/services/careers";

type CareerJobPageProps = { params: Promise<{ jobId: string }> };

export async function generateMetadata({ params }: CareerJobPageProps): Promise<Metadata> {
  const { jobId } = await params;
  const job = await getCareerJob(jobId).catch(() => null);
  return job ? { title: job.title, description: job.summary ?? undefined } : {};
}

// A published role. Anything else (a draft, closed, an unknown id) is "This role isn't open" (not-found.tsx).
export default async function CareerJobPage({ params }: CareerJobPageProps) {
  await connection();
  const { jobId } = await params;
  const job = await getCareerJob(jobId).catch((error: unknown) => ({ error: errorMessage(error) }));
  if (!job) notFound();
  if ("error" in job) {
    return (
      <div className="pt-8 sm:pt-12">
        <CareersUnavailable message={job.error} />
      </div>
    );
  }
  return <CareerJobView job={job} />;
}
