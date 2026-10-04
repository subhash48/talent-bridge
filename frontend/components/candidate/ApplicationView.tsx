"use client";

import { ArrowRight, BriefcaseBusiness, Mail } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect } from "react";

import { ActivityList } from "@/components/candidate/ActivityList";
import { ApplicationProgress } from "@/components/candidate/ApplicationProgress";
import { useCandidatePortal } from "@/components/candidate/CandidatePortalProvider";
import { CandidateHeader } from "@/components/candidate/CandidateHeader";
import { LoadError } from "@/components/candidate/LoadError";
import { Avatar } from "@/components/shared/Avatar";
import { EmptyState } from "@/components/shared/EmptyState";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { PortalStatusBadge } from "@/components/candidate/PortalStatusBadge";
import { buttonStyles } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { useLiveQuery } from "@/hooks/useLiveQuery";
import { engagement } from "@/lib/engagement";
import { firstName, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getCandidateApplication } from "@/services/portal";
import type { CandidateApplicationDetail } from "@/types/portal";

type ApplicationViewProps = { applicationId: string; initialDetail?: CandidateApplicationDetail };

/** One of the candidate's applications. Opening it makes it the one the whole portal shows. */
export function ApplicationView({ applicationId, initialDetail }: ApplicationViewProps) {
  const { applicationId: selected, selectApplication } = useCandidatePortal();
  const load = useCallback(() => getCandidateApplication(applicationId), [applicationId]);
  const { data, error, refresh } = useLiveQuery(load, { initialData: initialDetail });

  useEffect(() => selectApplication(applicationId), [applicationId, selectApplication]);
  useEffect(() => {
    if (selected === applicationId) engagement.track({ type: "application_viewed" });
  }, [selected, applicationId]);

  if (!data) {
    return (
      <>
        <CandidateHeader title="My Application" />
        {error ? <LoadError title="Your application couldn't load" message={error} onRetry={() => void refresh()} /> : <ApplicationSkeleton />}
      </>
    );
  }

  const { application, job, recruiter, timeline } = data;
  const active = application.status === "active";
  const details = [
    { label: "Company", value: job.company },
    { label: "Team", value: job.department },
    { label: "Location", value: job.location },
    { label: "Employment type", value: job.employmentType },
    { label: "Hiring manager", value: job.hiringManager },
  ].filter((item): item is { label: string; value: string } => Boolean(item.value));

  return (
    <>
      <CandidateHeader title="My Application" subtitle={`${job.title} at ${job.company}`} />
      <div className="flex flex-col gap-5">
        <Card className="p-5 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold tracking-tight text-ink">Hiring progress</h2>
            <PortalStatusBadge stage={application.stage} status={application.status} label={application.stageLabel} />
          </div>
          <div className="mt-8">
            <ApplicationProgress application={application} showDates />
          </div>
          <div
            className={cn(
              "mt-8 rounded-[14px] px-4 py-3.5 ring-1",
              active ? "bg-ai/[0.08] ring-ai/20" : "bg-white/[0.03] ring-white/[0.08]",
            )}
          >
            <p className="text-xs font-medium text-stone">{active ? "Next step" : "Status"}</p>
            <p className="mt-1 text-sm text-ink">{application.nextStep}</p>
          </div>
        </Card>

        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex flex-col gap-5">
            {(job.summary || job.requirements.length > 0) && (
            <Card className="p-5 sm:p-6">
              <h2 className="font-semibold tracking-tight text-ink">About the role</h2>
              {job.summary && <p className="mt-3 text-sm leading-relaxed text-charcoal">{job.summary}</p>}
              {job.requirements.length > 0 && (
                <>
                  <h3 className="mt-5 text-xs font-medium text-stone">What the team is looking for</h3>
                  <ul className="mt-2 flex flex-wrap gap-2" aria-label="Skills in the job posting">
                    {job.requirements.map((skill) => (
                      <li key={skill} className="rounded-full bg-white/[0.05] px-3 py-1 text-[13px] text-charcoal ring-1 ring-white/[0.08]">
                        {skill}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Card>
            )}

            <Card className="p-5 sm:p-6">
              <h2 className="mb-5 font-semibold tracking-tight text-ink">Timeline</h2>
              {timeline.length > 0 ? (
                <ActivityList items={timeline} />
              ) : (
                <p className="text-sm text-stone">Updates to your application will appear here.</p>
              )}
            </Card>
          </div>

          <div className="flex flex-col gap-5">
            <Card className="p-5 sm:p-6">
              <h2 className="font-semibold tracking-tight text-ink">Details</h2>
              <dl className="mt-4 flex flex-col gap-3 text-sm">
                {details.map((item) => (
                  <div key={item.label} className="flex justify-between gap-4">
                    <dt className="text-stone">{item.label}</dt>
                    <dd className="text-right text-charcoal">{item.value}</dd>
                  </div>
                ))}
                <div className="flex justify-between gap-4">
                  <dt className="text-stone">Applied</dt>
                  <dd className="text-right text-charcoal" suppressHydrationWarning>
                    {formatDate(application.appliedAt)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-stone">Last updated</dt>
                  <dd className="text-right text-charcoal">
                    <RelativeTime iso={application.updatedAt} />
                  </dd>
                </div>
              </dl>
            </Card>

            {recruiter && (
              <Card className="p-5 sm:p-6">
                <h2 className="font-semibold tracking-tight text-ink">Your recruiter</h2>
                <div className="mt-4 flex items-center gap-3">
                  <Avatar name={recruiter.name} size={44} />
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">{recruiter.name}</p>
                    <p className="truncate text-[13px] text-stone">
                      {recruiter.title} · {job.company}
                    </p>
                  </div>
                </div>
                <a href={`mailto:${recruiter.email}`} className="mt-4 inline-flex items-center gap-2 text-sm text-charcoal hover:text-ink">
                  <Mail aria-hidden className="size-4 text-stone" /> {recruiter.email}
                </a>
                <Link href="/candidate/messages" className={buttonStyles({ variant: "secondary", size: "sm", className: "mt-4 w-full" })}>
                  Message {firstName(recruiter.name)} <ArrowRight />
                </Link>
              </Card>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export function NoApplication({ company }: { company: string }) {
  return (
    <>
      <CandidateHeader title="My Application" />
      <EmptyState
        icon={BriefcaseBusiness}
        title="No application yet"
        description={`When you apply for a role at ${company}, its progress, interviews and messages appear here.`}
      />
    </>
  );
}

function ApplicationSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading your application">
      <Skeleton className="h-[260px] rounded-[18px]" />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Skeleton className="h-[420px] rounded-[18px]" />
        <Skeleton className="h-[320px] rounded-[18px]" />
      </div>
    </div>
  );
}
