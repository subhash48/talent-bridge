import { ArrowRight, BriefcaseBusiness } from "lucide-react";
import Link from "next/link";

import { Section } from "@/components/site/Section";
import { buttonStyles } from "@/components/ui/Button";

/**
 * Hirvello's own open positions. None are listed: add one here (its title, team, place and where to apply) and it
 * shows on the page in place of the note. Nothing is invented meanwhile: no roles, pay, benefits or team size.
 */
const OPENINGS: { title: string; team: string; location: string; href: string }[] = [];

/** Working at Hirvello. Not the job board: /jobs is the open roles of the companies hiring with Hirvello. */
export function CompanyCareersSection() {
  return (
    <Section
      level="h1"
      id="careers"
      eyebrow="Careers at Hirvello"
      title="Help hiring stop going quiet."
      intro="Hirvello is in beta and works on one problem: people who apply, interview, and then hear nothing back. If that bothers you too, we'd like to hear from you."
    >
      <div className="mt-10 max-w-[720px]">
        <h2 className="text-[1.25rem] font-semibold tracking-[-0.015em] text-ink">Open positions</h2>
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
                    <span className="block text-[1rem] font-semibold text-ink">{opening.title}</span>
                    <span className="mt-0.5 block text-[0.875rem] text-stone">
                      {opening.team} · {opening.location}
                    </span>
                  </span>
                  <ArrowRight aria-hidden className="size-4 text-faint transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="sky-card mt-4 rounded-[20px] px-6 py-6 text-[1rem] leading-relaxed text-charcoal">
            There are no open positions at the moment. When one opens, it will be listed here first.
          </p>
        )}
        <p className="mt-5 text-[0.875rem] leading-relaxed text-stone">
          Looking for a job at a company that hires with Hirvello? Those roles are on the{" "}
          <Link href="/jobs" className="font-medium text-brand-ink underline-offset-4 hover:underline">
            job board
          </Link>
          , not here.
        </p>
      </div>

      <div className="mt-10 flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-[34rem] text-[1.0625rem] leading-relaxed text-charcoal">
          Interested in the work even so? Tell us what you&apos;d bring, and we&apos;ll keep it in mind when a role
          opens.
        </p>
        <Link href="/contact" className={buttonStyles({ size: "lg", className: "group shrink-0" })}>
          Say hello
          <ArrowRight aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5" />
        </Link>
      </div>
    </Section>
  );
}
