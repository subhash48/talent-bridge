"use client";

import { ArrowLeft, MapPin, UserRound } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

import { JobStatusBadge } from "@/components/recruiter/JobStatusBadge";
import { StageBreakdown, emptyStageCounts } from "@/components/recruiter/StageBreakdown";
import { useWorkspace } from "@/components/recruiter/WorkspaceProvider";
import { Avatar } from "@/components/shared/Avatar";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { sortCandidates } from "@/lib/candidate-query";
import { STAGE_FILL_STYLES } from "@/lib/stages";
import { cn } from "@/lib/utils";
import { STAGE_LABELS } from "@/types/application";
import { PIPELINE_STAGES, type JobOpening } from "@/types/workspace";

/** /recruiter/jobs/[id]: the job's applicants grouped by stage. */
export function JobPipeline({ job }: { job: JobOpening }) {
  const { candidates } = useWorkspace();
  const applicants = useMemo(
    () =>
      sortCandidates(
        // By id: a demo job can have the same title as another job. The title is only a fallback for rows without one.
        candidates.filter((candidate) => (candidate.jobId ? candidate.jobId === job.id : candidate.role === job.title)),
        "recent",
      ),
    [candidates, job.id, job.title],
  );
  const counts = useMemo(() => {
    const result = emptyStageCounts();
    for (const candidate of applicants) result[candidate.stage] += 1;
    return result;
  }, [applicants]);

  return (
    <div className="flex flex-col gap-6 pt-1">
      <Link href="/recruiter/jobs" className="inline-flex w-fit items-center gap-2 rounded-sm text-sm text-stone transition-colors hover:text-ink">
        <ArrowLeft aria-hidden className="size-4" /> Jobs
      </Link>

      <header className="glass rounded-[22px] border border-border p-6 sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm text-stone">{job.department}</p>
            <h1 className="mt-1 text-[32px] leading-tight font-semibold tracking-[-0.03em] text-ink">{job.title}</h1>
            <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-stone">{job.summary}</p>
          </div>
          <JobStatusBadge status={job.status} className="h-7 rounded-[8px] px-2.5" />
        </div>
        <p className="mt-5 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-stone">
          <span className="inline-flex items-center gap-1.5">
            <MapPin aria-hidden className="size-4" /> {job.location} · {job.employmentType}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <UserRound aria-hidden className="size-4" /> Hiring manager: {job.hiringManager}
          </span>
          <span>
            Opened <RelativeTime iso={job.openedAt} />
          </span>
        </p>
        <StageBreakdown counts={counts} className="mt-6 max-w-xl" />
      </header>

      <section aria-label="Applicants by stage" className="-mx-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 xl:mx-0 xl:px-0">
        <div className="grid min-w-[1100px] grid-cols-5 gap-3 xl:min-w-0">
          {PIPELINE_STAGES.map((stage) => {
            const column = applicants.filter((candidate) => candidate.stage === stage);
            return (
              <div key={stage} className="flex flex-col rounded-[18px] border border-border bg-white/[0.02] p-3">
                <h2 className="flex items-center gap-2 px-1.5 pt-1 pb-3 text-sm font-medium text-ink">
                  <span aria-hidden className={cn("size-2 rounded-full", STAGE_FILL_STYLES[stage])} />
                  {STAGE_LABELS[stage]}
                  <span className="ml-auto text-xs font-normal text-stone tabular-nums">{column.length}</span>
                </h2>
                {column.length === 0 ? (
                  <p className="rounded-[12px] border border-dashed border-border px-3 py-6 text-center text-xs text-faint">No one here yet</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {column.map((candidate) => (
                      <li key={candidate.id}>
                        <Link
                          href={`/recruiter/candidates?candidate=${candidate.id}`}
                          className="flex items-start gap-3 rounded-[12px] bg-white/[0.04] p-3 ring-1 ring-white/[0.06] transition-[background-color,box-shadow] hover:bg-white/[0.07] hover:ring-white/[0.12]"
                        >
                          <Avatar name={candidate.name} src={candidate.avatarUrl} size={32} />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-ink">{candidate.name}</span>
                            <span className="mt-0.5 block truncate text-xs text-stone">{candidate.lastActivity}</span>
                            <span className="mt-1 flex items-center gap-1.5 text-xs text-faint">
                              <RelativeTime iso={candidate.lastActivityAt} />
                              {candidate.followUp && <span className="text-amber-200">· Follow up</span>}
                            </span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
