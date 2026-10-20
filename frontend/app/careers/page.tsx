import type { Metadata } from "next";
import { connection } from "next/server";

import { CareerJobList } from "@/components/careers/CareerJobList";
import { CareersUnavailable } from "@/components/careers/CareersNotices";
import { errorMessage } from "@/services/api";
import { listCareerJobs } from "@/services/careers";

export const metadata: Metadata = { title: "Open roles" };

export default async function CareersPage() {
  // Rendered per request: a role shows here as soon as it opens, and goes when it closes.
  await connection();
  const jobs = await listCareerJobs("native").catch((error: unknown) => ({ error: errorMessage(error) }));

  return (
    <div className="pt-8 sm:pt-12">
      <header className="pb-8">
        <p className="text-xs font-medium tracking-wide text-ai">Careers</p>
        <h1 className="mt-2 text-[34px] leading-tight font-semibold tracking-[-0.03em] text-ink sm:text-[44px]">Open roles</h1>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-stone">
          Apply with your name, email and résumé. No account needed: we&apos;ll email you a link to your candidate portal, where you&apos;ll
          always see where your application stands and what happens next.
        </p>
      </header>
      {jobs && "error" in jobs ? (
        <CareersUnavailable message={jobs.error} />
      ) : (
        <CareerJobList jobs={jobs ?? []} basePath="/careers" />
      )}
    </div>
  );
}
