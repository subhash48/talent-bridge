"use client";

import { BriefcaseBusiness, MapPin, UserRound } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { JobStatusBadge } from "@/components/recruiter/JobStatusBadge";
import { RecruiterHeader } from "@/components/recruiter/RecruiterHeader";
import { StageBreakdown, emptyStageCounts, type StageCounts } from "@/components/recruiter/StageBreakdown";
import { useWorkspace } from "@/components/recruiter/WorkspaceProvider";
import { EmptyState } from "@/components/shared/EmptyState";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { FilterChip } from "@/components/ui/FilterChip";
import type { JobStatus } from "@/types/job";
import type { JobOpening, PipelineCandidate } from "@/types/workspace";

const STATUS_FILTERS: { value: "all" | JobStatus; label: string }[] = [
  { value: "all", label: "All roles" },
  { value: "open", label: "Open" },
  { value: "paused", label: "Paused" },
  { value: "draft", label: "Draft" },
];

/** Candidates per stage for each job title, from the live workspace list. */
function useStageCountsByRole(candidates: PipelineCandidate[]) {
  return useMemo(() => {
    const byRole = new Map<string, StageCounts>();
    for (const candidate of candidates) {
      const counts = byRole.get(candidate.role) ?? emptyStageCounts();
      counts[candidate.stage] += 1;
      byRole.set(candidate.role, counts);
    }
    return byRole;
  }, [candidates]);
}

export function JobsBoard({ jobs }: { jobs: JobOpening[] }) {
  const { candidates } = useWorkspace();
  const [status, setStatus] = useState<"all" | JobStatus>("all");
  const countsByRole = useStageCountsByRole(candidates);
  const shown = jobs.filter((job) => status === "all" || job.status === status);
  const openRoles = jobs.filter((job) => job.status === "open").length;

  return (
    <div>
      <RecruiterHeader title="Jobs" subtitle={`${openRoles} open roles · ${candidates.length} candidates in the pipeline`} />

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
              <JobCard job={job} counts={countsByRole.get(job.title) ?? emptyStageCounts()} />
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
