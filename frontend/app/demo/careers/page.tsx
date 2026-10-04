import type { Metadata } from "next";
import { connection } from "next/server";

import { CareerJobList } from "@/components/careers/CareerJobList";
import { CareersOff, CareersUnavailable } from "@/components/careers/CareersNotices";
import { errorMessage } from "@/services/api";
import { listCareerJobs } from "@/services/careers";

export const metadata: Metadata = { title: "Open roles" };

export default async function CareersPage() {
  // Rendered per request: a role shows here as soon as a recruiter publishes it, and goes when they
  // unpublish or close it.
  await connection();
  const jobs = await listCareerJobs().catch((error: unknown) => ({ error: errorMessage(error) }));

  return (
    <div className="pt-8 sm:pt-12">
      <header className="pb-8">
        <p className="text-xs font-medium tracking-wide text-ai">Careers at Encord</p>
        <h1 className="mt-2 text-[34px] leading-tight font-semibold tracking-[-0.03em] text-ink sm:text-[44px]">Open roles</h1>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-stone">
          Apply with your résumé in a few minutes, then follow your application in the Encord candidate portal.
        </p>
      </header>
      {jobs === null ? <CareersOff /> : "error" in jobs ? <CareersUnavailable message={jobs.error} /> : <CareerJobList jobs={jobs} />}
    </div>
  );
}
