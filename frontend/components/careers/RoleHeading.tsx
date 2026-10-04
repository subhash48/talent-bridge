import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { JobFacts } from "@/components/careers/JobFacts";
import { cn } from "@/lib/utils";
import type { CareerJob } from "@/types/careers";

type RoleHeadingProps = {
  job: CareerJob;
  back: { href: string; label: string };
  /** A line above the title, e.g. the department. */
  eyebrow?: string | null;
  children?: ReactNode;
};

/** The top of a role's pages: a way back, the title and the facts about the role. */
export function RoleHeading({ job, back, eyebrow, children }: RoleHeadingProps) {
  return (
    <header>
      <Link href={back.href} className="inline-flex items-center gap-1.5 rounded-md text-sm text-stone transition-colors hover:text-ink">
        <ArrowLeft aria-hidden className="size-4" />
        {back.label}
      </Link>
      {eyebrow && <p className="mt-6 text-sm text-stone">{eyebrow}</p>}
      <h1 className={cn("text-[30px] leading-tight font-semibold tracking-[-0.03em] text-ink sm:text-[40px]", eyebrow ? "mt-1.5" : "mt-6")}>
        {job.title}
      </h1>
      <JobFacts job={job} className="mt-3" />
      {children}
    </header>
  );
}
