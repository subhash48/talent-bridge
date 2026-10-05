"use client";

import { CircleX, ExternalLink, EyeOff, FlaskConical, Globe, LoaderCircle, Pencil, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { DemoJobStatusBadge } from "@/components/recruiter/DemoJobStatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button, buttonStyles, type ButtonVariant } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toaster";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ApiError, errorMessage } from "@/services/api";
import { closeDemoJob, publishDemoJob, unpublishDemoJob } from "@/services/demo-jobs";
import type { DemoJob } from "@/types/demo";

type Action = "publish" | "unpublish" | "close";

const ACTIONS: Record<Action, { request: (id: string) => Promise<DemoJob>; done: string; outcome: string; failed: string }> = {
  publish: {
    request: publishDemoJob,
    done: "Demo job published",
    outcome: "is on the demo careers site.",
    failed: "Couldn't publish the demo job",
  },
  unpublish: {
    request: unpublishDemoJob,
    done: "Demo job unpublished",
    outcome: "is off the demo careers site. Its applicants keep their applications.",
    failed: "Couldn't unpublish the demo job",
  },
  close: {
    request: closeDemoJob,
    done: "Demo job closed",
    outcome: "no longer takes applications. Existing applications are kept.",
    failed: "Couldn't close the demo job",
  },
};

const headerCell = "border-b border-border px-3 pb-2.5 text-[13px] font-normal text-stone first:pl-0 last:pr-0";
const cell = "border-b border-border px-3 py-2.5 align-middle first:pl-0 last:pr-0 group-last:border-b-0";

const editPath = (job: DemoJob) => `/recruiter/jobs/demo/${job.id}`;

type DemoJobsSectionProps = {
  jobs: DemoJob[];
  /** Why the demo jobs couldn't load, if they couldn't. */
  error?: string;
};

/**
 * Development demo: the recruiter's demo jobs and their postings on the demo careers site. Each one is
 * an ordinary job too, so it also appears with the other roles below.
 */
export function DemoJobsSection({ jobs, error }: DemoJobsSectionProps) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [running, setRunning] = useState<{ id: string; action: Action }>();
  // Kept after the dialog closes, so its text doesn't change while it animates out.
  const [closing, setClosing] = useState<{ job: DemoJob; open: boolean }>();

  function run(job: DemoJob, action: Action) {
    const { request, done, outcome, failed } = ACTIONS[action];
    setRunning({ id: job.id, action });
    // Pending until the refreshed page is on screen, so the row never shows its old status as current.
    startTransition(async () => {
      try {
        await request(job.id);
        toast({ title: done, description: `${job.title} ${outcome}`, tone: "success" });
        // Re-render from the server: this list, and the job's own status among the roles below.
        router.refresh();
      } catch (requestError) {
        const incomplete = requestError instanceof ApiError && requestError.code === "posting_incomplete";
        toast({
          title: failed,
          description: errorMessage(requestError),
          tone: "error",
          // The editor shows what's missing, field by field.
          action: incomplete ? { label: "Edit", onClick: () => router.push(editPath(job)) } : undefined,
        });
      }
    });
  }

  const actionProps = (job: DemoJob, action: Action) => ({
    busy: pending && running?.id === job.id && running.action === action,
    disabled: pending,
    jobTitle: job.title,
  });

  return (
    <section aria-labelledby="demo-jobs-heading" className="glass mb-6 rounded-[14px] border border-border p-5 sm:p-5">
      <h2 id="demo-jobs-heading" className="flex flex-wrap items-center gap-2 text-base font-semibold tracking-tight text-ink">
        <FlaskConical aria-hidden className="size-4 text-stone" />
        Demo jobs
        <span className="inline-flex h-6 items-center rounded-[6px] bg-caution/10 px-2 text-xs font-medium text-caution ring-1 ring-caution/20 ring-inset">
          Development demo
        </span>
      </h2>
      <p className="mt-1.5 max-w-2xl text-sm text-stone">
        Postings for the demo careers site. Applicants join your pipeline through the Ashby simulator once they activate, or sign
        in to, their candidate portal account.
      </p>

      {error ? (
        <p className="mt-4 rounded-[10px] bg-caution/[0.06] px-3.5 py-2.5 text-sm text-caution ring-1 ring-caution/20">
          Demo jobs couldn&apos;t load: {error}
        </p>
      ) : jobs.length === 0 ? (
        <EmptyState title="No demo jobs yet" description="Create one to publish it on the demo careers site." className="mt-4 py-8" />
      ) : (
        <div className="-mx-5 mt-4 overflow-x-auto px-5 sm:-mx-5 sm:px-5">
          <table aria-labelledby="demo-jobs-heading" className="w-full min-w-[760px] border-separate border-spacing-0 text-left text-sm">
            <thead>
              <tr>
                <th scope="col" className={headerCell}>
                  Title
                </th>
                <th scope="col" className={headerCell}>
                  Status
                </th>
                <th scope="col" className={headerCell}>
                  Applicants
                </th>
                <th scope="col" className={headerCell}>
                  Published
                </th>
                <th scope="col" className={cn(headerCell, "text-right")}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} className="group">
                  <td className={cell}>
                    <Link href={editPath(job)} className="rounded-sm font-medium text-ink underline-offset-4 hover:underline">
                      {job.title}
                    </Link>
                    {(job.department || job.location) && (
                      <p className="mt-0.5 text-[13px] text-stone">{[job.department, job.location].filter(Boolean).join(" · ")}</p>
                    )}
                  </td>
                  <td className={cell}>
                    <DemoJobStatusBadge status={job.status} />
                  </td>
                  <td className={cn(cell, "text-charcoal")}>
                    <span className="tabular-nums">{job.applicant_count}</span>
                    {job.pending_count > 0 && (
                      <span className="text-stone">
                        {" "}
                        · <span className="tabular-nums">{job.pending_count}</span> awaiting activation
                      </span>
                    )}
                  </td>
                  <td className={cn(cell, "text-charcoal")}>
                    {job.status === "published" && job.published_at ? (
                      <time dateTime={job.published_at} suppressHydrationWarning>
                        {formatDate(job.published_at)}
                      </time>
                    ) : (
                      <span className="text-faint">—</span>
                    )}
                  </td>
                  <td className={cell}>
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      <Link href={editPath(job)} aria-label={`Edit ${job.title}`} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                        <Pencil aria-hidden /> Edit
                      </Link>
                      {job.status === "published" && (
                        <a
                          href={job.public_path}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`View public page for ${job.title} (opens in a new tab)`}
                          className={buttonStyles({ variant: "secondary", size: "sm" })}
                        >
                          <ExternalLink aria-hidden /> View public page
                        </a>
                      )}
                      {job.status === "published" ? (
                        <ActionButton label="Unpublish" icon={EyeOff} onClick={() => run(job, "unpublish")} {...actionProps(job, "unpublish")} />
                      ) : (
                        <ActionButton label="Publish" icon={Globe} onClick={() => run(job, "publish")} {...actionProps(job, "publish")} />
                      )}
                      {job.status !== "closed" && (
                        <ActionButton
                          label="Close"
                          icon={CircleX}
                          variant="ghost"
                          onClick={() => setClosing({ job, open: true })}
                          {...actionProps(job, "close")}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {closing && (
        <Modal
          open={closing.open}
          onClose={() => setClosing({ ...closing, open: false })}
          title={`Close “${closing.job.title}”?`}
          description="It comes off the demo careers site and stops taking applications. Nothing is deleted: people who already applied keep their applications, and their portal shows the role as closed."
        >
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setClosing({ ...closing, open: false })}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setClosing({ ...closing, open: false });
                run(closing.job, "close");
              }}
            >
              <CircleX aria-hidden /> Close job
            </Button>
          </div>
        </Modal>
      )}
    </section>
  );
}

type ActionButtonProps = {
  label: string;
  icon: LucideIcon;
  jobTitle: string;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
  variant?: ButtonVariant;
};

function ActionButton({ label, icon: Icon, jobTitle, busy, disabled, onClick, variant = "secondary" }: ActionButtonProps) {
  return (
    <Button variant={variant} size="sm" onClick={onClick} disabled={disabled} aria-label={`${label} ${jobTitle}`}>
      {busy ? <LoaderCircle className="animate-spin" aria-hidden /> : <Icon aria-hidden />}
      {label}
    </Button>
  );
}
