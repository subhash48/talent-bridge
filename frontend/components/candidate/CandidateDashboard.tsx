"use client";

import { BriefcaseBusiness } from "lucide-react";
import { useSyncExternalStore } from "react";

import { AskAIEntry } from "@/components/candidate/AskAIEntry";
import { useCandidatePortal } from "@/components/candidate/CandidatePortalProvider";
import { CandidateTopActions } from "@/components/candidate/CandidateTopActions";
import { CurrentApplicationCard } from "@/components/candidate/CurrentApplicationCard";
import { FourQuestions } from "@/components/candidate/FourQuestions";
import { LastUpdateCard } from "@/components/candidate/LastUpdateCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { ASK_AI_PROMPTS } from "@/lib/ask-ai";
import { greetingFor } from "@/lib/format";
import type { CandidateApplication, PortalJob } from "@/types/portal";

/**
 * The portal home, in order of what matters: the greeting with one sentence on where they stand, the
 * company and role with its progress, then plain answers to where am I, what happens next, do I need
 * to do anything and how should I prepare, the last update from the team, and a way into Ask AI.
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
      <section className="lg:pt-3">
        <div className="flex items-start justify-between gap-3">
          <h1 className="min-w-0 pt-1.5">
            <span className="block text-base leading-6 text-stone sm:text-lg sm:leading-6">{localGreeting},</span>
            <span className="block truncate text-[30px] leading-[1.1] font-semibold tracking-[-0.03em] text-ink sm:text-[38px]">
              {me.candidate.firstName}
            </span>
          </h1>
          <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
            <CandidateTopActions />
          </div>
        </div>
        <p className="mt-1 max-w-[62ch] text-sm text-stone">{statusSentence(application, job, me.company?.name)}</p>
      </section>

      {application && job ? (
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
      ) : (
        <EmptyState
          icon={BriefcaseBusiness}
          title="No application yet"
          description="When you apply for a role, its progress, interviews and messages appear here."
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
function statusSentence(application: CandidateApplication | null, job: PortalJob | null, company?: string): string {
  if (!application || !job || !company) return "When you apply for a role, you can follow it here.";
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
