"use client";

import { MessageCircle, Phone, Sparkles } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { useWorkspace } from "@/components/recruiter/WorkspaceProvider";
import { buttonStyles } from "@/components/ui/Button";
import { daysLabel } from "@/lib/days";
import { formatRelativeTime, pluralize } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PipelineCandidate } from "@/types/workspace";

/**
 * Everyone who applied to the business's jobs, newest first, by job: the days they said they can work, their
 * experience in their own words, and the phone number they gave, to call or message them. Only people who
 * applied to this business are ever here.
 */
export function HireApplicants({ initialJob }: { initialJob: string | null }) {
  const { candidates, jobs } = useWorkspace();
  const [job, setJob] = useState<string | null>(jobs.some((each) => each.id === initialJob) ? initialJob : null);
  const shown = useMemo(
    () =>
      candidates
        .filter((candidate) => !job || candidate.jobId === job)
        .sort((a, b) => Date.parse(b.addedAt) - Date.parse(a.addedAt)),
    [candidates, job],
  );
  const withApplicants = jobs.filter((each) => candidates.some((candidate) => candidate.jobId === each.id));

  return (
    <div>
      <h1 className="text-[28px] font-semibold tracking-tight text-ink sm:text-[32px]">Applicants</h1>
      <p className="mt-1 text-[15px] text-stone">{pluralize(shown.length, "person", "people")} applied.</p>
      {withApplicants.length > 1 && (
        <div role="group" aria-label="Which job" className="mt-4 flex flex-wrap gap-2">
          {[{ id: null, title: "All jobs" }, ...withApplicants].map((each) => (
            <button
              key={each.id ?? "all"}
              type="button"
              aria-pressed={job === each.id}
              onClick={() => setJob(each.id)}
              className={cn(
                "rounded-full px-4 py-2 text-[15px] font-medium transition-colors",
                job === each.id ? "bg-brand text-on-brand" : "border border-border text-charcoal hover:bg-muted",
              )}
            >
              {each.title}
            </button>
          ))}
        </div>
      )}
      {shown.length === 0 ? (
        <div className="glass mt-8 rounded-[18px] border border-border p-8 text-center">
          <p className="text-lg font-semibold text-ink">Nobody has applied yet</p>
          <p className="mx-auto mt-1 max-w-md text-[15px] text-stone">
            When people apply on your careers page, they show up here with the days they can work.
          </p>
        </div>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {shown.map((candidate) => (
            <ApplicantRow key={candidate.id} candidate={candidate} />
          ))}
        </ul>
      )}
      <p className="mt-8 flex items-start gap-2 text-sm text-stone">
        <Sparkles aria-hidden className="mt-0.5 size-4 shrink-0 text-brand-ink" />
        <span>
          To find the right people, ask on{" "}
          <Link href="/hire" className="font-medium text-brand-ink underline-offset-4 hover:underline">
            Home
          </Link>
          : &ldquo;Show me 3 applicants with kitchen experience who are available Friday and Saturday.&rdquo;
        </span>
      </p>
    </div>
  );
}

function ApplicantRow({ candidate }: { candidate: PipelineCandidate }) {
  const phone = candidate.applicationPhone;
  return (
    <li className="glass rounded-[18px] border border-border p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-lg font-semibold text-ink">{candidate.name}</p>
        <p className="text-sm text-faint">
          {candidate.role} · applied {formatRelativeTime(candidate.addedAt)}
        </p>
      </div>
      {candidate.availability && candidate.availability.length > 0 && (
        <p className="mt-2 text-[15px] text-charcoal">
          <span className="font-medium">Can work:</span> {daysLabel(candidate.availability)}
        </p>
      )}
      {candidate.experienceNote && (
        <p className="mt-1 text-[15px] text-charcoal">
          <span className="font-medium">Experience:</span> &ldquo;{candidate.experienceNote}&rdquo;
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {phone ? (
          <a
            href={`tel:${phone.replace(/[^\d+]/g, "")}`}
            className={buttonStyles({ variant: "secondary", size: "lg" })}
          >
            <Phone aria-hidden /> {phone}
          </a>
        ) : (
          <span className="inline-flex h-10 items-center px-1 text-sm text-faint">No phone number given</span>
        )}
        <Link
          href={`/hire/messages?applicant=${candidate.id}`}
          className={buttonStyles({ variant: "secondary", size: "lg" })}
        >
          <MessageCircle aria-hidden /> Message
        </Link>
      </div>
    </li>
  );
}
