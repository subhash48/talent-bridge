import {
  Banknote,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  ChartNoAxesColumnIncreasing,
  Clock,
  MapPin,
  Users,
  type LucideIcon,
} from "lucide-react";

import { daysLabel, openingsLabel } from "@/lib/days";
import { cn } from "@/lib/utils";
import type { CareerJob } from "@/types/careers";

/** Where and how the role is worked: location, work arrangement, employment type, seniority and pay, and a
 * small business's shift, days and openings, when known. */
export function JobFacts({ job, className }: { job: CareerJob; className?: string }) {
  const facts: { label: string; value: string | null; icon: LucideIcon }[] = [
    { label: "Location", value: job.location, icon: MapPin },
    { label: "Work arrangement", value: job.workArrangement, icon: Building2 },
    { label: "Employment type", value: job.employmentType, icon: BriefcaseBusiness },
    { label: "Seniority", value: job.seniority, icon: ChartNoAxesColumnIncreasing },
    { label: "Pay", value: job.pay ?? job.salary, icon: Banknote },
    { label: "Shift", value: job.shift, icon: Clock },
    { label: "Days", value: job.workDays.length ? daysLabel(job.workDays) : null, icon: CalendarDays },
    { label: "Openings", value: job.openings ? openingsLabel(job.openings) : null, icon: Users },
  ];
  return (
    <ul className={cn("flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] text-stone", className)}>
      {facts
        .filter((fact) => fact.value)
        .map(({ label, value, icon: Icon }) => (
          <li key={label} className="inline-flex items-center gap-1.5">
            <Icon aria-hidden className="size-3.5 shrink-0" />
            <span className="sr-only">{label}: </span>
            {value}
          </li>
        ))}
    </ul>
  );
}
