import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { ApplyForm } from "@/components/careers/ApplyForm";
import { CandidateApplyForm } from "@/components/jobs/CandidateApplyForm";
import { JobTags } from "@/components/jobs/JobTags";
import { SwitchCandidateAccount } from "@/components/jobs/SwitchCandidateAccount";
import { boardFrom, jobHref } from "@/components/jobs/board";
import { getPublicJob } from "@/components/jobs/getPublicJob";
import { buttonStyles } from "@/components/ui/Button";
import { loginPath } from "@/lib/auth";
import { getSignedInUser } from "@/lib/session";
import { getCandidateProfile } from "@/services/portal";

export const metadata: Metadata = { title: "Apply for a job" };
type Props = { params: Promise<{ jobId: string }>; searchParams: Promise<{ from?: string | string[] }> };

export default async function ApplyPage({ params, searchParams }: Props) {
  const [job, user] = await Promise.all([getPublicJob((await params).jobId), getSignedInUser()]);
  if (!job) notFound();
  const from = boardFrom((await searchParams).from);
  const next = jobHref(job.id, from, "apply");
  // The phone on file is a convenience: if the profile can't be read, the form still opens with the account's name and email.
  const profile = user?.role === "candidate" ? await getCandidateProfile().catch(() => null) : null;
  const applicant = user?.role === "candidate"
    ? { fullName: profile?.fullName ?? user.name, email: profile?.email ?? user.email, phone: profile?.phone ?? null }
    : null;
  return (
    <div className="mx-auto max-w-3xl px-5 pt-6 pb-20 sm:px-8 sm:pt-10">
      <Link href={jobHref(job.id, from)} className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-brand-ink">
        <ArrowLeft aria-hidden className="size-4" /> Back to role
      </Link>
      <p className="mt-5 text-sm font-medium text-brand-ink">{job.company}</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-ink">Apply for {job.title}</h1>
      <JobTags job={job} className="mt-4 mb-7" />
      {applicant ? <CandidateApplyForm job={job} candidate={applicant} /> : user ? (
        <div className="sky-card rounded-[20px] p-6">
          <p className="text-charcoal">You&apos;re signed in with an employer account. Sign out and sign in with your candidate account to apply.</p>
          <SwitchCandidateAccount next={next} />
        </div>
      ) : (
        <>
          <div className="sky-card mb-7 rounded-[20px] p-6">
            <h2 className="text-lg font-semibold text-ink">Sign in to apply with your Hirvello account</h2>
            <p className="mt-2 text-sm text-charcoal">Keep your applications and updates together in your candidate portal.</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href={loginPath({ audience: "candidate", next })} className={buttonStyles({ size: "lg" })}>Sign in</Link>
              <Link href={`/signup?${new URLSearchParams({ next })}`} className={buttonStyles({ size: "lg", variant: "secondary" })}>Create account</Link>
            </div>
          </div>
          <h2 className="mb-4 text-lg font-semibold text-ink">Or apply without an account</h2>
          <ApplyForm jobId={job.id} site="native" workDays={job.workDays} />
        </>
      )}
    </div>
  );
}
