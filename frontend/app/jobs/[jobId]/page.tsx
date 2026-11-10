import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Banknote } from "lucide-react";

import { RoleSections } from "@/components/careers/CareerJobView";
import { ClosingDate } from "@/components/jobs/ClosingDate";
import { CompanyLogo } from "@/components/jobs/CompanyLogo";
import { JobTags } from "@/components/jobs/JobTags";
import { SourceBadge } from "@/components/jobs/SourceBadge";
import { boardFrom, jobHref, postedLabel } from "@/components/jobs/board";
import { getPublicJob } from "@/components/jobs/getPublicJob";
import { buttonStyles } from "@/components/ui/Button";

type Props = { params: Promise<{ jobId: string }>; searchParams: Promise<{ from?: string | string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const job = await getPublicJob((await params).jobId);
  return { title: job ? `${job.title}${job.company ? ` at ${job.company}` : ""}` : "Job unavailable" };
}

export default async function JobPage({ params, searchParams }: Props) {
  const job = await getPublicJob((await params).jobId);
  if (!job) notFound();
  const from = boardFrom((await searchParams).from);
  const apply = jobHref(job.id, from, "apply");
  const pay = job.salary ?? job.pay;
  return (
    <div className="mx-auto max-w-[1100px] px-5 pt-6 pb-20 sm:px-8 sm:pt-10">
      <Link href={from ? `/jobs?${from}` : "/jobs"} className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-brand-ink">
        <ArrowLeft aria-hidden className="size-4" /> All jobs
      </Link>
      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <CompanyLogo name={job.company ?? "Hiring company"} logoUrl={job.companyLogoUrl} size={44} />
            <p className="font-medium text-charcoal">{job.company}{job.department && ` · ${job.department}`}</p>
          </div>
          <h1 className="mt-5 text-3xl leading-tight font-bold tracking-tight text-ink sm:text-4xl">{job.title}</h1>
          <JobTags job={job} full lead={job.source && <SourceBadge source={job.source} />} className="mt-5" />
          {pay && <p className="mt-5 flex items-center gap-2 font-semibold text-ink"><Banknote aria-hidden className="size-5 text-brand-ink" />{pay}</p>}
          {job.summary && <p className="mt-6 whitespace-pre-line text-[1.0625rem] leading-relaxed text-charcoal">{job.summary}</p>}
          <Link href={apply} className={buttonStyles({ size: "lg", className: "mt-6 w-full sm:w-auto lg:hidden" })}>Apply now</Link>
          {(job.aboutRole || job.requirements.length > 0 || job.responsibilities.length > 0 || job.preferredQualifications.length > 0 ||
            job.skills.length > 0 || job.aboutTeam) && (
            <div className="sky-card mt-7 flex flex-col gap-7 rounded-[20px] p-5 sm:p-7"><RoleSections job={job} /></div>
          )}
        </div>
        <aside aria-label="Apply" className="sky-card h-fit rounded-[20px] p-6 lg:sticky lg:top-24">
          <Link href={apply} className={buttonStyles({ size: "lg", className: "w-full" })}>Apply now</Link>
          <p className="mt-4 text-sm leading-relaxed text-charcoal">Have your résumé ready: PDF, DOC or DOCX, up to 5 MB.</p>
          <p className="mt-4 text-sm text-stone">{postedLabel(job.publishedAt)}</p>
          {job.expiresAt && <ClosingDate at={job.expiresAt} className="mt-2 text-sm text-stone" />}
        </aside>
      </div>
    </div>
  );
}
