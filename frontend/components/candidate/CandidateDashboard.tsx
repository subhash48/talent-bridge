"use client";

import { BriefcaseBusiness } from "lucide-react";
import { useSyncExternalStore } from "react";

import { AskAIEntry } from "@/components/candidate/AskAIEntry";
import { useCandidatePortal } from "@/components/candidate/CandidatePortalProvider";
import { CandidateTopActions } from "@/components/candidate/CandidateTopActions";
import { CareerRunGreeting } from "@/components/candidate/CareerRunGreeting";
import { CurrentApplicationCard } from "@/components/candidate/CurrentApplicationCard";
import { LatestUpdateCard } from "@/components/candidate/LatestUpdateCard";
import { NextStepCard } from "@/components/candidate/NextStepCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { ASK_AI_PROMPTS } from "@/lib/ask-ai";
import { greetingFor } from "@/lib/format";
import type { CandidateApplication, PortalJob } from "@/types/portal";

/**
 * The portal home, in order of what matters: the greeting (set in a small game, Career Run), where
 * the current application stands, the one next step, the latest update, and a way into Ask AI.
 * Everything else (every application, interviews, messages, the company, the full assistant) has
 * its own page.
 */
export function CandidateDashboard({ greeting }: { greeting: string }) {
  const { me } = useCandidatePortal();
  // The server greets by its own clock. In the browser the candidate's local time decides, checked each minute.
  const localGreeting = useSyncExternalStore(everyMinute, greetingFor, () => greeting);
  const { application, job } = me;

  return (
    <div className="flex flex-col gap-5">
      <CareerRunGreeting
        greeting={localGreeting}
        name={me.candidate.firstName}
        status={statusSentence(application, job, me.company)}
        actions={<CandidateTopActions />}
      />

      {application && job ? (
        <>
          <CurrentApplicationCard application={application} job={job} otherApplications={me.applications.length - 1} />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <NextStepCard me={me} application={application} />
            <LatestUpdateCard latest={me.recentActivity[0] ?? null} applicationId={application.id} />
          </div>
          <AskAIEntry
            description={`Questions about ${me.company}, the role, benefits or your application?`}
            prompts={ASK_AI_PROMPTS.slice(0, 2)}
          />
        </>
      ) : (
        <EmptyState
          icon={BriefcaseBusiness}
          title="No application yet"
          description={`When you apply for a role at ${me.company}, its progress, interviews and messages appear here.`}
        />
      )}
    </div>
  );
}

function everyMinute(onChange: () => void) {
  const timer = window.setInterval(onChange, 60_000);
  return () => window.clearInterval(timer);
}

/** One short sentence on where the current application stands. */
function statusSentence(application: CandidateApplication | null, job: PortalJob | null, company: string): string {
  if (!application || !job) return `When you apply for a role at ${company}, you can follow it here.`;
  const role = job.title;
  if (application.status === "no_longer_considered") return `Your application for ${role} is no longer under consideration.`;
  if (application.stage === "hired") return `Congratulations, you’ve been hired as ${role}.`;
  if (application.status === "inactive") return `Your application for ${role} is no longer active.`;
  switch (application.stage) {
    case "sourced":
      return `We’ve received your application for ${role}.`;
    case "screening":
      return `Your application for ${role} is being reviewed.`;
    case "interview":
      return `Your application for ${role} is at the interview stage.`;
    case "offer":
      return `Your application for ${role} has reached the offer stage.`;
    default:
      return `Here’s where your application for ${role} stands.`;
  }
}
