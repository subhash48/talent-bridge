import { Banknote, BriefcaseBusiness, Building2, ChartNoAxesColumnIncreasing, MapPin, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import type { CareerJob } from "@/types/careers";

/** Where and how the role is worked: location, work arrangement, employment type, seniority and pay, when known. */
export function JobFacts({ job, className }: { job: CareerJob; className?: string }) {
  const facts: { label: string; value: string | null; icon: LucideIcon }[] = [
    { label: "Location", value: job.location, icon: MapPin },
    { label: "Work arrangement", value: job.workArrangement, icon: Building2 },
    { label: "Employment type", value: job.employmentType, icon: BriefcaseBusiness },
    { label: "Seniority", value: job.seniority, icon: ChartNoAxesColumnIncreasing },
    { label: "Salary", value: job.salary, icon: Banknote },
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
