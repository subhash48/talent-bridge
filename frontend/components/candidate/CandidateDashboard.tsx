"use client";

import { ArrowRight, BriefcaseBusiness } from "lucide-react";
import Link from "next/link";

import { ActivityList } from "@/components/candidate/ActivityList";
import { ApplicationStatusCard } from "@/components/candidate/ApplicationStatusCard";
import { AskAssistant } from "@/components/candidate/AskAssistant";
import { useCandidatePortal } from "@/components/candidate/CandidatePortalProvider";
import { MessagesCard } from "@/components/candidate/MessagesCard";
import { NextInterviewCard } from "@/components/candidate/NextInterviewCard";
import { PrepCard } from "@/components/candidate/PrepCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { buttonStyles } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useLiveQuery } from "@/hooks/useLiveQuery";
import { getCandidatePrep } from "@/services/portal";
import type { CandidateApplication, CandidateMeResponse, PortalJob } from "@/types/portal";

// Stable for useLiveQuery. Prep changes slowly, so it refreshes every few minutes.
const loadPrep = () => getCandidatePrep();
const PREP_REFRESH_MS = 5 * 60_000;

export function CandidateDashboard({ greeting }: { greeting: string }) {
  const { me } = useCandidatePortal();

  return (
    <div className="flex flex-col gap-6">
      <header className="pt-2 pb-2">
        <h1 className="text-ink">
          <span className="block text-xl text-charcoal sm:text-[22px]">{greeting},</span>
          <span className="mt-1 block text-[48px] leading-[0.95] font-semibold tracking-[-0.045em] sm:text-[64px]">
            {me.candidate.firstName}
          </span>
        </h1>
        <p className="mt-4 text-base text-stone sm:text-[17px]">Here’s what’s happening with your application.</p>
      </header>

      {me.application && me.job ? (
        <ApplicationDashboard me={me} application={me.application} job={me.job} />
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

type ApplicationDashboardProps = { me: CandidateMeResponse; application: CandidateApplication; job: PortalJob };

function ApplicationDashboard({ me, application, job }: ApplicationDashboardProps) {
  const prep = useLiveQuery(loadPrep, { intervalMs: PREP_REFRESH_MS });

  return (
    <>
      <ApplicationStatusCard application={application} job={job} />

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        <NextInterviewCard interview={me.nextInterview} />
        <MessagesCard unread={me.unreadMessages} latest={me.latestMessage} />
        <PrepCard prep={prep} interviewTitle={me.nextInterview?.title ?? null} className="md:col-span-2 xl:col-span-1" />
      </div>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-2">
        <Card className="p-5 sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <h2 className="font-semibold tracking-tight text-ink">Recent activity</h2>
            <Link href="/candidate/application" className={buttonStyles({ variant: "ghost", size: "sm" })}>
              Full timeline <ArrowRight />
            </Link>
          </div>
          {me.recentActivity.length > 0 ? (
            <ActivityList items={me.recentActivity.slice(0, 6)} />
          ) : (
            <p className="text-sm text-stone">Nothing yet. Updates to your application will appear here.</p>
          )}
        </Card>
        <AskAssistant />
      </div>
    </>
  );
}
