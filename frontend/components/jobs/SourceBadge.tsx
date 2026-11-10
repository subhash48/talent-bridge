import { BriefcaseBusiness, Store, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import type { JobSource } from "@/types/careers";

// Who posted a job, fixed when it was posted from the employer's workspace. It only says who posted it, never
// that anyone checked them. Both tints keep their text above 4.5:1.
const SOURCES: Record<JobSource, { label: string; icon: LucideIcon; tone: string }> = {
  recruiter: { label: "Posted by Recruiter", icon: BriefcaseBusiness, tone: "bg-accent-soft text-brand-ink ring-brand-ink/15" },
  small_business: { label: "Posted by Small Business", icon: Store, tone: "bg-[#ecebff] text-[#4338ca] ring-[#4338ca]/15" },
};

export function SourceBadge({ source, className }: { source: JobSource | null; className?: string }) {
  if (!source) return null;
  const { label, icon: Icon, tone } = SOURCES[source];
  return (
    <span
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-medium whitespace-nowrap ring-1 ring-inset",
        tone,
        className,
      )}
    >
      <Icon aria-hidden className="size-3.5 shrink-0" />
      {label}
    </span>
  );
}
