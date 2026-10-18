import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { ApplyForm } from "@/components/careers/ApplyForm";
import { CareersUnavailable } from "@/components/careers/CareersNotices";
import { RoleHeading } from "@/components/careers/RoleHeading";
import { errorMessage } from "@/services/api";
import { getCareerJob } from "@/services/careers";

type ApplyPageProps = { params: Promise<{ jobId: string }> };

export async function generateMetadata({ params }: ApplyPageProps): Promise<Metadata> {
  const { jobId } = await params;
  const job = await getCareerJob(jobId, "native").catch(() => null);
  return job ? { title: `Apply for ${job.title}` } : {};
}

// Name, email and résumé. The application reaches the hiring team the moment it's sent.
export default async function ApplyPage({ params }: ApplyPageProps) {
  await connection();
  const { jobId } = await params;
  const job = await getCareerJob(jobId, "native").catch((error: unknown) => ({ error: errorMessage(error) }));
  if (!job) notFound();
  if ("error" in job) {
    return (
      <div className="pt-8 sm:pt-12">
        <CareersUnavailable message={job.error} />
      </div>
    );
  }

  return (
    <div className="max-w-2xl pt-6 sm:pt-8">
      <RoleHeading job={job} back={{ href: `/careers/${job.id}`, label: "Back to the role" }} eyebrow="Apply for" />
      <div className="mt-8">
        <ApplyForm jobId={job.id} site="native" />
      </div>
    </div>
  );
}
