"use client";

import { BriefcaseBusiness, MapPin, Plus, UserRound } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { DemoJobsSection } from "@/components/recruiter/DemoJobsSection";
import { JobStatusBadge } from "@/components/recruiter/JobStatusBadge";
import { RecruiterHeader } from "@/components/recruiter/RecruiterHeader";
import { StageBreakdown, emptyStageCounts, type StageCounts } from "@/components/recruiter/StageBreakdown";
import { useWorkspace } from "@/components/recruiter/WorkspaceProvider";
import { EmptyState } from "@/components/shared/EmptyState";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { buttonStyles } from "@/components/ui/Button";
import { FilterChip } from "@/components/ui/FilterChip";
import type { DemoJob } from "@/types/demo";
import type { JobStatus } from "@/types/job";
import type { JobOpening, PipelineCandidate } from "@/types/workspace";

const STATUS_FILTERS: { value: "all" | JobStatus; label: string }[] = [
  { value: "all", label: "All roles" },
  { value: "open", label: "Open" },
  { value: "draft", label: "Draft" },
  { value: "closed", label: "Closed" },
];

/** Candidates per stage for each job id, from the live workspace list. */
function useStageCountsByJob(jobs: JobOpening[], candidates: PipelineCandidate[]) {
  return useMemo(() => {
    const byJob = new Map<string, StageCounts>();
    for (const candidate of candidates) {
      // By id: a demo job can have the same title as another job. The title is only a fallback for rows without one.
      const jobIds = candidate.jobId ? [candidate.jobId] : jobs.filter((job) => job.title === candidate.role).map((job) => job.id);
      for (const jobId of jobIds) {
        const counts = byJob.get(jobId) ?? emptyStageCounts();
        counts[candidate.stage] += 1;
        byJob.set(jobId, counts);
      }
    }
    return byJob;
  }, [jobs, candidates]);
}

type JobsBoardProps = {
  jobs: JobOpening[];
  /** Development only (ENABLE_ASHBY_DEMO): null while the demo is off, and in mock mode. */
  demoJobs?: DemoJob[] | null;
  /** Why the demo jobs couldn't load, if they couldn't. */
  demoError?: string;
};

export function JobsBoard({ jobs, demoJobs = null, demoError }: JobsBoardProps) {
  const { candidates } = useWorkspace();
  const [status, setStatus] = useState<"all" | JobStatus>("all");
  const countsByJob = useStageCountsByJob(jobs, candidates);
  const shown = jobs.filter((job) => status === "all" || job.status === status);
  const openRoles = jobs.filter((job) => job.status === "open").length;

  return (
    <div>
      <RecruiterHeader
        title="Jobs"
        subtitle={`${openRoles} open roles · ${candidates.length} candidates in the pipeline`}
        actions={
          demoJobs &&
          !demoError && (
            <Link href="/recruiter/jobs/demo/new" className={buttonStyles()}>
              <Plus aria-hidden /> Create Demo Job
            </Link>
          )
        }
      />

      {demoJobs && <DemoJobsSection jobs={demoJobs} error={demoError} />}

      <div role="group" aria-label="Filter by status" className="scrollbar-none mb-6 flex gap-2 overflow-x-auto">
        {STATUS_FILTERS.map((filter) => {
          const count = filter.value === "all" ? jobs.length : jobs.filter((job) => job.status === filter.value).length;
          return (
            <FilterChip key={filter.value} active={status === filter.value} onClick={() => setStatus(filter.value)}>
              {filter.label} <span className="tabular-nums">({count})</span>
            </FilterChip>
          );
        })}
      </div>

      {shown.length === 0 ? (
        <EmptyState icon={BriefcaseBusiness} title="No roles here" description="Roles with this status will appear here." />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {shown.map((job) => (
            <li key={job.id}>
              <JobCard job={job} counts={countsByJob.get(job.id) ?? emptyStageCounts()} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function JobCard({ job, counts }: { job: JobOpening; counts: StageCounts }) {
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);

  return (
    <Link
      href={`/recruiter/jobs/${job.id}`}
      className="glass group flex h-full flex-col rounded-[20px] border border-border p-5 transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-border-strong sm:p-6"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] text-stone">{job.department}</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-ink">{job.title}</h2>
        </div>
        <JobStatusBadge status={job.status} />
      </div>
      <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-stone">{job.summary}</p>
      <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-stone">
        <span className="inline-flex items-center gap-1.5">
          <MapPin aria-hidden className="size-3.5" /> {job.location}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <UserRound aria-hidden className="size-3.5" /> {job.hiringManager}
        </span>
      </p>
      <StageBreakdown counts={counts} className="mt-5 mb-5" />
      <div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-4 text-[13px] text-stone">
        <span>
          <span className="font-medium text-ink tabular-nums">{total}</span> {total === 1 ? "candidate" : "candidates"}
        </span>
        <span>
          Opened <RelativeTime iso={job.openedAt} />
        </span>
      </div>
    </Link>
  );
}
