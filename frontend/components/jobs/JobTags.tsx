import {
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  ChartNoAxesColumnIncreasing,
  Clock,
  MapPin,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { daysLabel, openingsLabel } from "@/lib/days";
import { cn } from "@/lib/utils";
import type { CareerJob } from "@/types/careers";

type JobTagsProps = {
  job: CareerJob;
  full?: boolean;
  /** Shown first in the same row, such as who posted the job. */
  lead?: ReactNode;
  className?: string;
};

/**
 * Where and how a job is worked, as small neutral tags: location, arrangement and employment type on a card;
 * the role's page adds seniority and a small business's shift, days and openings. Missing facts are left out.
 */
export function JobTags({ job, full = false, lead, className }: JobTagsProps) {
  const tags: { label: string; value: string | null; icon: LucideIcon }[] = [
    { label: "Location", value: job.location, icon: MapPin },
    { label: "Work arrangement", value: job.workArrangement, icon: Building2 },
    { label: "Employment type", value: job.employmentType, icon: BriefcaseBusiness },
    ...(full
      ? [
          { label: "Seniority", value: job.seniority, icon: ChartNoAxesColumnIncreasing },
          { label: "Shift", value: job.shift, icon: Clock },
          { label: "Days", value: job.workDays.length ? daysLabel(job.workDays) : null, icon: CalendarDays },
          { label: "Openings", value: job.openings ? openingsLabel(job.openings) : null, icon: Users },
        ]
      : []),
  ];
  const shown = tags.filter((tag) => tag.value);
  if (shown.length === 0 && !lead) return null;
  return (
    <ul className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {lead && <li className="inline-flex">{lead}</li>}
      {shown.map(({ label, value, icon: Icon }) => (
        <li
          key={label}
          className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-full bg-ink/[0.045] px-2.5 text-[13px] text-charcoal ring-1 ring-ink/[0.06] ring-inset"
        >
          <Icon aria-hidden className="size-3.5 shrink-0 text-stone" />
          <span className="sr-only">{label}: </span>
          <span className="truncate">{value}</span>
        </li>
      ))}
    </ul>
  );
}
