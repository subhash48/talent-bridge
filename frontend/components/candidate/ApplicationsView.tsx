"use client";

import { BriefcaseBusiness, CalendarDays, ChevronRight } from "lucide-react";
import Link from "next/link";

import { useCandidatePortal } from "@/components/candidate/CandidatePortalProvider";
import { CandidateHeader } from "@/components/candidate/CandidateHeader";
import { PortalStatusBadge } from "@/components/candidate/PortalStatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { Card } from "@/components/ui/Card";
import { formatDayLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CandidateApplicationSummary } from "@/types/portal";

type Group = "active" | "completed" | "withdrawn";

const GROUPS: { group: Group; title: string; empty: string }[] = [
  { group: "active", title: "Active", empty: "No active applications right now." },
  {
    group: "completed",
    title: "Completed / Inactive",
    empty: "Applications that have finished, or whose role has closed, appear here.",
  },
  { group: "withdrawn", title: "Withdrawn", empty: "Applications you withdraw appear here." },
];

/** Completed / Inactive holds everything that ended without the candidate withdrawing: hired, no
 * longer under consideration, or a role that closed. */
function groupOf(application: CandidateApplicationSummary): Group {
  if (application.status === "active") return "active";
  return application.withdrawn ? "withdrawn" : "completed";
}

/** Every application the candidate has made, by where it stands. Opening one switches the portal
 * (interviews, messages, prep) to it. */
export function ApplicationsView() {
  const { me, applicationId } = useCandidatePortal();

  if (me.applications.length === 0) {
    return (
      <>
        <CandidateHeader title="Applications" />
        <EmptyState
          icon={BriefcaseBusiness}
          title="No application yet"
          description={`When you apply for a role at ${me.company}, it appears here.`}
        />
      </>
    );
  }

  return (
    <>
      <CandidateHeader title="Applications" subtitle={`Every role you’ve applied for at ${me.company}.`} />
      <div className="flex flex-col gap-5">
        {GROUPS.map(({ group, title, empty }) => {
          const items = me.applications.filter((application) => groupOf(application) === group);
          return (
            <Card key={group} className="p-5 sm:p-6">
              <section aria-label={title}>
                <h2 className="font-semibold tracking-tight text-ink">
                  {title} <span className="font-normal text-stone">({items.length})</span>
                </h2>
                {items.length > 0 ? (
                  <ul className="mt-4 flex flex-col gap-1.5">
                    {items.map((application) => (
                      <ApplicationRow key={application.id} application={application} selected={application.id === applicationId} />
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-stone">{empty}</p>
                )}
              </section>
            </Card>
          );
        })}
      </div>
    </>
  );
}

function ApplicationRow({ application, selected }: { application: CandidateApplicationSummary; selected: boolean }) {
  const meta = [application.company, application.department, application.location].filter(Boolean).join(" · ");
  return (
    <li>
      <Link
        href={`/candidate/application/${application.id}`}
        aria-current={selected ? "true" : undefined}
        className={cn(
          "flex items-center gap-3 rounded-[12px] px-3 py-2.5 ring-1 transition-colors",
          selected ? "bg-white/[0.06] ring-white/[0.12]" : "ring-transparent hover:bg-white/[0.04]",
        )}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium text-ink">{application.jobTitle}</span>
          <span className="mt-0.5 block truncate text-[13px] text-stone">{meta}</span>
          <span className="mt-0.5 block text-xs text-charcoal sm:hidden">{application.stageLabel}</span>
          {application.nextInterviewAt && (
            <span className="mt-1 flex items-center gap-1.5 text-xs text-charcoal" suppressHydrationWarning>
              <CalendarDays aria-hidden className="size-3.5 text-stone" />
              Next interview {formatDayLabel(application.nextInterviewAt)}
            </span>
          )}
        </span>
        {application.unreadMessages > 0 && (
          <span className="rounded-full bg-ai/20 px-2 py-0.5 text-[11px] font-medium text-violet-100">
            {application.unreadMessages} new
          </span>
        )}
        <PortalStatusBadge stage={application.stage} status={application.status} label={application.stageLabel} className="hidden sm:inline-flex" />
        <ChevronRight aria-hidden className="size-4 shrink-0 text-faint" />
      </Link>
    </li>
  );
}
