"use client";

import { BriefcaseBusiness } from "lucide-react";

import { AskAIEntry } from "@/components/candidate/AskAIEntry";
import { useCandidatePortal } from "@/components/candidate/CandidatePortalProvider";
import { CurrentApplicationCard } from "@/components/candidate/CurrentApplicationCard";
import { LatestUpdateCard } from "@/components/candidate/LatestUpdateCard";
import { NextStepCard } from "@/components/candidate/NextStepCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { ASK_AI_PROMPTS } from "@/lib/ask-ai";
import type { CandidateApplication, PortalJob } from "@/types/portal";

/**
 * The portal home, in order of what matters: where the current application stands, the one next
 * step, the latest update, and a way into Ask AI. Everything else (every application, interviews,
 * messages, the company, the full assistant) has its own page.
 */
export function CandidateDashboard({ greeting }: { greeting: string }) {
  const { me } = useCandidatePortal();
  const { application, job } = me;

  return (
    <div className="flex flex-col gap-6">
      <header className="pt-2 pb-2">
        <h1 className="text-ink">
          <span className="block text-xl text-charcoal sm:text-[22px]">{greeting},</span>
          <span className="mt-1 block text-[48px] leading-[0.95] font-semibold tracking-[-0.045em] sm:text-[64px]">
            {me.candidate.firstName}
          </span>
        </h1>
        <p className="mt-4 text-base text-stone sm:text-[17px]">{statusSentence(application, job, me.company)}</p>
      </header>

      {application && job ? (
        <>
          <CurrentApplicationCard application={application} job={job} otherApplications={me.applications.length - 1} />
          <div className="grid grid-cols-1 gap-5 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
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
