"use client";

import { CalendarDays, ChevronRight } from "lucide-react";
import Link from "next/link";

import { useCandidatePortal } from "@/components/candidate/CandidatePortalProvider";
import { PortalStatusBadge } from "@/components/candidate/PortalStatusBadge";
import { Card } from "@/components/ui/Card";
import { formatDayLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ApplicationStatus, CandidateApplicationSummary } from "@/types/portal";

const SECTIONS: { status: ApplicationStatus; title: string }[] = [
  { status: "active", title: "Active applications" },
  { status: "no_longer_considered", title: "No longer under consideration" },
  { status: "inactive", title: "Inactive applications" },
];

/** Every application the candidate has made, grouped by where it stands. Opening one switches the
 * portal (interviews, messages, prep) to it. */
export function MyApplications() {
  const { me, applicationId } = useCandidatePortal();
  if (me.applications.length === 0) return null;

  return (
    <Card className="p-5 sm:p-6">
      <h2 className="font-semibold tracking-tight text-ink">My applications</h2>
      <div className="mt-4 flex flex-col gap-5">
        {SECTIONS.map(({ status, title }) => {
          const items = me.applications.filter((application) => application.status === status);
          if (items.length === 0) return null;
          return (
            <section key={status} aria-label={title}>
              <h3 className="text-[11px] font-semibold tracking-[0.08em] text-faint uppercase">
                {title} <span className="text-stone">({items.length})</span>
              </h3>
              <ul className="mt-2 flex flex-col gap-1.5">
                {items.map((application) => (
                  <ApplicationRow key={application.id} application={application} selected={application.id === applicationId} />
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </Card>
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
