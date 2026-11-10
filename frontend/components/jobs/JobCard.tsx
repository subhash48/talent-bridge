import { ArrowRight, Banknote, Clock } from "lucide-react";
import Link from "next/link";

import { CompanyLogo } from "@/components/jobs/CompanyLogo";
import { JobTags } from "@/components/jobs/JobTags";
import { SourceBadge } from "@/components/jobs/SourceBadge";
import { jobHref, postedLabel } from "@/components/jobs/board";
import { buttonStyles } from "@/components/ui/Button";
import type { CareerJob } from "@/types/careers";

type JobCardProps = {
  job: CareerJob;
  /** The board's state (its URL query), so the job's page can lead back to the same search. */
  from?: string;
};

/**
 * One job on the board. The card itself isn't a link: its two actions are, so nothing interactive nests and each
 * action reads on its own ("View details", "Apply now"), described by the job's title.
 */
export function JobCard({ job, from = "" }: JobCardProps) {
  const titleId = `job-${job.id}-title`;
  const company = job.company ?? "Hiring company";
  const pay = job.salary ?? job.pay;
  const posted = postedLabel(job.publishedAt);

  return (
    <article
      aria-labelledby={titleId}
      className="sky-card group/card flex h-full flex-col rounded-[20px] p-5 transition-[box-shadow,border-color] duration-200 hover:border-white/90 hover:shadow-raised sm:p-6"
    >
      <div className="flex items-start gap-3.5">
        <CompanyLogo name={company} logoUrl={job.companyLogoUrl} size={44} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.875rem] font-medium text-charcoal">
            {company}
            {job.department && <span className="font-normal text-stone"> · {job.department}</span>}
          </p>
          <h3 id={titleId} className="mt-0.5 text-[1.125rem] leading-snug font-semibold tracking-[-0.015em] text-pretty text-ink sm:text-[1.1875rem]">
            {job.title}
          </h3>
        </div>
      </div>

      <JobTags job={job} lead={job.source && <SourceBadge source={job.source} />} className="mt-4" />

      {pay && (
        <p className="mt-4 flex items-center gap-2 text-[0.9375rem] font-semibold text-ink">
          <Banknote aria-hidden className="size-4 shrink-0 text-brand-ink" />
          <span className="sr-only">Pay: </span>
          <span>{pay}</span>
        </p>
      )}

      {job.summary && <p className="mt-3 line-clamp-2 text-[0.875rem] leading-relaxed text-charcoal">{job.summary}</p>}

      <div className="mt-auto flex flex-col gap-3 pt-5 sm:flex-row sm:items-center sm:justify-between">
        {posted ? (
          <p className="flex items-center gap-1.5 text-[13px] text-charcoal">
            <Clock aria-hidden className="size-3.5 shrink-0 text-stone" />
            {posted}
          </p>
        ) : (
          <span />
        )}
        <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
          <Link
            href={jobHref(job.id, from)}
            aria-describedby={titleId}
            className={buttonStyles({ variant: "secondary", size: "lg", className: "px-4 text-[0.875rem] backdrop-blur-none" })}
          >
            View details
          </Link>
          <Link
            href={jobHref(job.id, from, "apply")}
            aria-describedby={titleId}
            className={buttonStyles({ size: "lg", className: "px-4 text-[0.875rem]" })}
          >
            Apply now
            <ArrowRight aria-hidden className="transition-transform duration-200 group-hover/card:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </article>
  );
}
