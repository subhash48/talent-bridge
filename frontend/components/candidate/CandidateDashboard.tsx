"use client";

import { BriefcaseBusiness } from "lucide-react";

import { ApplicationSelector } from "@/components/candidate/ApplicationSelector";
import { AskAIEntry } from "@/components/candidate/AskAIEntry";
import { useCandidatePortal } from "@/components/candidate/CandidatePortalProvider";
import { CurrentApplicationCard } from "@/components/candidate/CurrentApplicationCard";
import { FourQuestions } from "@/components/candidate/FourQuestions";
import { LastUpdateCard } from "@/components/candidate/LastUpdateCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { ASK_AI_PROMPTS } from "@/lib/ask-ai";

/**
 * The portal home, in order of what matters: every application, as a row of cards to choose from, then
 * the chosen one: its company and role with its progress, plain answers to where am I, what happens
 * next, do I need to do anything and how should I prepare, the last update from its team, and a way
 * into Ask AI about it. Everything else (interviews, messages, the company, the full assistant) has its
 * own page, which follows the same choice.
 */
export function CandidateDashboard() {
  const { me, selectedId, switching } = useCandidatePortal();
  const { application, job } = me;

  let content;
  if (switching) {
    // The chosen application's details are on their way. The previous one's are never shown under it.
    const chosen = me.applications.find((item) => item.id === selectedId);
    content = (
      <div className="flex flex-col gap-4" aria-busy="true">
        <p role="status" className="sr-only">
          {chosen ? `Loading your ${chosen.jobTitle} application at ${chosen.company}` : "Loading your application"}
        </p>
        <Skeleton className="h-[218px] rounded-[14px]" />
        <Skeleton className="h-[300px] rounded-[14px]" />
      </div>
    );
  } else if (application && job) {
    content = (
      <>
        <CurrentApplicationCard application={application} job={job} otherApplications={me.applications.length - 1} />
        <FourQuestions me={me} application={application} />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <LastUpdateCard me={me} />
          <AskAIEntry
            description={`Questions about ${me.company?.name ?? "the company"}, the role, benefits or your application?`}
            prompts={ASK_AI_PROMPTS.slice(0, 2)}
          />
        </div>
      </>
    );
  } else {
    content = (
      <EmptyState
        icon={BriefcaseBusiness}
        title="No application yet"
        description="When you apply for a role, its progress, interviews and messages appear here."
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="sr-only">Dashboard</h1>
      <ApplicationSelector />
      {content}
    </div>
  );
}
