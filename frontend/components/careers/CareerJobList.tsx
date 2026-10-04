import { ArrowRight, BriefcaseBusiness } from "lucide-react";
import Link from "next/link";

import { JobFacts } from "@/components/careers/JobFacts";
import { EmptyState } from "@/components/shared/EmptyState";
import { buttonStyles } from "@/components/ui/Button";
import { pluralize } from "@/lib/format";
import type { CareerJob } from "@/types/careers";

/** The published roles, one card each; the whole card opens the role. */
export function CareerJobList({ jobs }: { jobs: CareerJob[] }) {
  if (jobs.length === 0) {
    return <EmptyState icon={BriefcaseBusiness} title="No open roles right now." description="Roles the hiring team publishes show up here." />;
  }

  return (
    <section aria-label="Open roles">
      <p className="mb-4 text-sm text-stone">{pluralize(jobs.length, "open role")}</p>
      <ul className="flex flex-col gap-3">
        {jobs.map((job) => (
          <li key={job.id}>
            <Link
              href={`/demo/careers/${job.id}`}
              className="glass group flex flex-col gap-4 rounded-[18px] border border-border p-5 transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-border-strong sm:flex-row sm:items-center sm:justify-between sm:gap-8 sm:p-6"
            >
              <div className="min-w-0">
                {job.department && <p className="text-[13px] text-stone">{job.department}</p>}
                <h2 className="mt-1 text-lg font-semibold tracking-tight text-ink">{job.title}</h2>
                <JobFacts job={job} className="mt-2" />
                {job.summary && <p className="mt-3 line-clamp-2 max-w-2xl text-sm leading-relaxed text-stone">{job.summary}</p>}
              </div>
              <span
                className={buttonStyles({
                  variant: "secondary",
                  size: "sm",
                  className: "self-start group-hover:border-border-strong group-hover:bg-white/[0.07] sm:self-center",
                })}
              >
                View role <ArrowRight aria-hidden />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
