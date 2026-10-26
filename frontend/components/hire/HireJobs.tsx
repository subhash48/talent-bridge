"use client";

import { ExternalLink, Megaphone, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useWorkspace } from "@/components/recruiter/WorkspaceProvider";
import { Button, buttonStyles } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toaster";
import { pluralize } from "@/lib/format";
import { jobFacts } from "@/lib/simple-hire";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/services/api";
import { setJobStatus } from "@/services/jobs";
import type { JobOpening } from "@/types/workspace";

/**
 * Simple Hire's jobs: each one with its facts, how many people applied, its page on the careers site, and a
 * button to stop or start taking applications. Posting a new one starts with the assistant.
 */
export function HireJobs() {
  const { jobs, candidates } = useWorkspace();
  const ordered = [...jobs].sort((a, b) => Number(a.status !== "open") - Number(b.status !== "open"));

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight text-ink sm:text-[32px]">Jobs</h1>
          <p className="mt-1 text-[15px] text-stone">
            {jobs.length ? `${pluralize(jobs.length, "job")}. Open ones are on your careers page.` : "No jobs yet."}
          </p>
        </div>
        <Link href="/hire?do=post" className={buttonStyles({ size: "lg" })}>
          <Megaphone aria-hidden /> Post a job
        </Link>
      </div>
      {ordered.length === 0 ? (
        <div className="glass mt-8 rounded-[18px] border border-border p-8 text-center">
          <p className="text-lg font-semibold text-ink">Post your first job</p>
          <p className="mx-auto mt-1 max-w-md text-[15px] text-stone">
            Say what you need, like &ldquo;A cashier, $16 an hour, weekend shifts&rdquo;. You&apos;ll see it before
            it&apos;s posted.
          </p>
        </div>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {ordered.map((job) => (
            <JobRow key={job.id} job={job} applicants={candidates.filter((each) => each.jobId === job.id).length} />
          ))}
        </ul>
      )}
    </div>
  );
}

function JobRow({ job, applicants }: { job: JobOpening; applicants: number }) {
  const router = useRouter();
  const { refresh } = useWorkspace();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const open = job.status === "open";
  const facts = jobFacts(job);

  async function toggle() {
    setPending(true);
    try {
      await setJobStatus(job.id, open ? "closed" : "open");
      await refresh();
      router.refresh();
      toast({
        title: open ? `${job.title} is no longer taking applications` : `${job.title} is taking applications again`,
        tone: "success",
      });
    } catch (error) {
      toast({ title: "Not changed", description: errorMessage(error, "Try again in a moment."), tone: "error" });
    } finally {
      setPending(false);
    }
  }

  return (
    <li className={cn("glass rounded-[18px] border border-border p-5", !open && "opacity-75")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-lg font-semibold text-ink">
            {job.title}
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-medium",
                open
                  ? "bg-sage/10 text-sage"
                  : job.status === "closed"
                    ? "bg-muted text-stone"
                    : "bg-caution/10 text-caution",
              )}
            >
              {open ? "Taking applications" : job.status === "closed" ? "Closed" : "Not posted"}
            </span>
          </p>
          {facts.length > 0 && <p className="mt-1 text-[15px] text-charcoal">{facts.join(" · ")}</p>}
          {job.location && <p className="mt-0.5 text-sm text-stone">{job.location}</p>}
        </div>
        <Link
          href={`/hire/applicants?job=${job.id}`}
          className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3.5 py-1.5 text-sm font-medium text-ink ring-1 ring-brand-ink/20 hover:bg-brand/35"
        >
          <Users aria-hidden className="size-4" />
          {pluralize(applicants, "applicant")}
        </Link>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {open && (
          <Link
            href={`/careers/${job.id}`}
            target="_blank"
            className={buttonStyles({ variant: "secondary", size: "md" })}
          >
            See it on your careers page <ExternalLink aria-hidden />
          </Link>
        )}
        {job.status !== "draft" && (
          <Button variant="ghost" size="md" onClick={() => void toggle()} disabled={pending}>
            {pending ? "Saving…" : open ? "Stop taking applications" : "Take applications again"}
          </Button>
        )}
      </div>
    </li>
  );
}
