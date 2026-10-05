import { ArrowRight, BriefcaseBusiness } from "lucide-react";
import Link from "next/link";

import { ApplicationProgress } from "@/components/candidate/ApplicationProgress";
import { PortalStatusBadge } from "@/components/candidate/PortalStatusBadge";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { buttonStyles } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { formatDate } from "@/lib/format";
import type { CandidateApplication, PortalJob } from "@/types/portal";

type CurrentApplicationCardProps = {
  application: CandidateApplication;
  job: PortalJob;
  /** How many other applications the candidate has; they're on the Applications page. */
  otherApplications: number;
};

/** The application the portal is showing: the role, where and how it's worked, its stage and progress. */
export function CurrentApplicationCard({ application, job, otherApplications }: CurrentApplicationCardProps) {
  const meta = [job.location, job.employmentType].filter(Boolean).join(" · ");

  return (
    <Card className="p-5 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-medium text-stone">
            <BriefcaseBusiness aria-hidden className="size-4" /> Current application
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-ink sm:text-2xl">{job.title}</h2>
          {meta && <p className="mt-1 text-sm text-stone">{meta}</p>}
        </div>
        <div className="flex items-center gap-2 sm:flex-col sm:items-end">
          <span className="text-xs text-faint sm:order-2">{application.status === "active" ? "Current stage" : "Status"}</span>
          <PortalStatusBadge stage={application.stage} status={application.status} label={application.stageLabel} />
        </div>
      </div>

      <div className="mt-6">
        <ApplicationProgress application={application} />
      </div>

      <div className="mt-6 flex flex-col gap-3 border-t border-border pt-4 md:flex-row md:items-center md:justify-between">
        <p className="text-xs text-faint">
          <span suppressHydrationWarning>Applied {formatDate(application.appliedAt)}</span> · Last updated{" "}
          <RelativeTime iso={application.updatedAt} />
        </p>
        <div className="flex flex-wrap gap-2">
          {otherApplications > 0 && (
            <Link href="/candidate/applications" className={buttonStyles({ variant: "ghost", size: "sm" })}>
              All applications
            </Link>
          )}
          <Link href={`/candidate/application/${application.id}`} className={buttonStyles({ variant: "secondary", size: "sm" })}>
            View application <ArrowRight />
          </Link>
        </div>
      </div>
    </Card>
  );
}
