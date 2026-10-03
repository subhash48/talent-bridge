import { ArrowRight, BriefcaseBusiness } from "lucide-react";
import Link from "next/link";

import { ApplicationProgress } from "@/components/candidate/ApplicationProgress";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { buttonStyles } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { formatDate } from "@/lib/format";
import type { CandidateApplication, PortalJob } from "@/types/portal";

export function ApplicationStatusCard({ application, job }: { application: CandidateApplication; job: PortalJob }) {
  const meta = [job.company, job.department, job.location].filter(Boolean).join(" · ");

  return (
    <Card className="p-5 sm:p-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[13px] font-medium text-stone">
            <BriefcaseBusiness aria-hidden className="size-4" /> Application status
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-[28px]">{job.title}</h2>
          <p className="mt-1 text-sm text-stone">{meta}</p>
        </div>
        <div className="flex items-center gap-2 sm:flex-col sm:items-end">
          <span className="text-xs text-faint sm:order-2">Current stage</span>
          <StatusBadge stage={application.stage} label={application.stageLabel} />
        </div>
      </div>

      <div className="mt-8">
        <ApplicationProgress application={application} />
      </div>

      <div className="mt-8 flex flex-col gap-4 border-t border-border pt-5 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="text-sm text-charcoal">{application.nextStep}</p>
          <p className="mt-1 text-xs text-faint">
            <span suppressHydrationWarning>Applied {formatDate(application.appliedAt)}</span> · Last updated{" "}
            <RelativeTime iso={application.updatedAt} />
          </p>
        </div>
        <Link href="/candidate/application" className={buttonStyles({ variant: "secondary", size: "sm", className: "self-start md:self-auto" })}>
          View application <ArrowRight />
        </Link>
      </div>
    </Card>
  );
}
