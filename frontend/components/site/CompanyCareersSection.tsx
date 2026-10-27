import { ArrowRight, BriefcaseBusiness } from "lucide-react";
import Link from "next/link";

import { Section } from "@/components/site/Section";

/**
 * Kavuntra's own open positions. None are listed: add one here (its title, team, place and where to apply) and it
 * shows on the page in place of the note. Nothing is invented meanwhile: no roles, pay, benefits or team size.
 */
const OPENINGS: { title: string; team: string; location: string; href: string }[] = [];

/** Working at Kavuntra. Not the job board: /careers is the open roles of the companies hiring with Kavuntra. */
export function CompanyCareersSection() {
  return (
    <Section
      level="h1"
      id="careers"
      eyebrow="Careers at Kavuntra"
      title="Build the future of hiring."
      intro="We're building tools that make hiring clearer, simpler, and more human."
    >
      <div className="mt-14 max-w-[720px]">
        <h2 className="text-[12px] font-semibold tracking-[0.18em] text-brand-ink/80 uppercase">Open positions</h2>
        {OPENINGS.length ? (
          <ul className="mt-4 flex flex-col gap-3">
            {OPENINGS.map((opening) => (
              <li key={opening.href}>
                <Link
                  href={opening.href}
                  className="group sky-card flex items-center gap-4 rounded-[18px] p-5 transition-[background-color,transform] duration-200 hover:-translate-y-px hover:bg-overlay/75"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-accent-soft/80 text-brand-ink">
                    <BriefcaseBusiness aria-hidden className="size-4.5" strokeWidth={1.75} />
                  </span>
                  <span className="flex-1">
                    <span className="block text-[16px] font-semibold text-ink">{opening.title}</span>
                    <span className="mt-0.5 block text-[14px] text-stone">
                      {opening.team} · {opening.location}
                    </span>
                  </span>
                  <ArrowRight aria-hidden className="size-4 text-faint transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="sky-card mt-4 rounded-[20px] px-6 py-6 text-[16px] leading-relaxed text-charcoal">
            We don&apos;t have any open positions listed right now. Check back for future opportunities.
          </p>
        )}
        <p className="mt-5 text-[14px] leading-relaxed text-stone">
          Looking for a job at a company that hires with Kavuntra? Those roles are on the{" "}
          <Link href="/careers" className="font-medium text-brand-ink underline-offset-4 hover:underline">
            job board
          </Link>
          , not here.
        </p>
      </div>
    </Section>
  );
}
