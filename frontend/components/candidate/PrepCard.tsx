"use client";

import { ArrowRight, BookOpenCheck } from "lucide-react";
import Link from "next/link";

import { buttonStyles } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import type { LiveQuery } from "@/hooks/useLiveQuery";
import { cn } from "@/lib/utils";
import type { CandidatePrep } from "@/types/portal";

/** A taste of the AI prep: the first few topics, with the full plan on the prep page. */
type PrepCardProps = { prep: LiveQuery<CandidatePrep>; interviewTitle: string | null; className?: string };

export function PrepCard({ prep, interviewTitle, className }: PrepCardProps) {
  const topics = prep.data?.topicsToReview.slice(0, 3) ?? [];

  return (
    <Card className={cn("flex flex-col p-5 sm:p-6", className)}>
      <p className="flex items-center gap-2 text-[13px] font-medium text-stone">
        <BookOpenCheck aria-hidden className="size-4" /> Interview prep
      </p>
      <h2 className="mt-3 text-xl font-semibold tracking-tight text-ink">
        {interviewTitle ? `Prepare for your ${interviewTitle}` : "Stay interview-ready"}
      </h2>
      {prep.loading ? (
        <div className="mt-4 flex flex-col gap-2.5" aria-busy="true" aria-label="Loading suggestions">
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      ) : topics.length > 0 ? (
        <>
          <p className="mt-3 text-xs font-medium text-faint">Suggested</p>
          <ul className="mt-1.5 flex flex-col gap-1.5 text-sm text-charcoal">
            {topics.map((topic) => (
              <li key={topic} className="flex gap-2">
                <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-ai" />
                <span className="line-clamp-1">{topic}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-3 text-sm text-stone">AI preparation is temporarily unavailable.</p>
      )}
      <div className="mt-auto pt-6">
        <Link href="/candidate/prep" className={buttonStyles({ variant: "ai", size: "sm" })}>
          Start preparation <ArrowRight />
        </Link>
      </div>
    </Card>
  );
}
