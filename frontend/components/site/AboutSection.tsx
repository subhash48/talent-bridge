import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { Section } from "@/components/site/Section";
import { SOLUTIONS } from "@/components/site/nav";
import { buttonStyles } from "@/components/ui/Button";

// Who Hirvello is for, with a line each, in the words of their own pages.
const SERVED = [
  { href: SOLUTIONS[0].href, who: "Recruiting teams", line: "that want to stay responsive as the pipeline grows." },
  { href: SOLUTIONS[1].href, who: "Candidates", line: "who want to know where they stand and how to prepare." },
  { href: SOLUTIONS[2].href, who: "Small businesses", line: "that need to hire without learning recruiting software." },
];

// The page's chapters: a short label, then the words. No customers, numbers, funding or history: none to claim.
const CHAPTERS = [
  {
    title: "Why Hirvello exists",
    text: "Hiring runs on conversations, and that is where it most often breaks down. Recruiting systems help a company organise its side of the process, but the candidate is often left without an update or a next step, and the recruiter has no simple way to see who has been waiting. Hirvello is built for that gap.",
  },
  {
    title: "The problem we’re solving",
    text: "Silence. A candidate applies, interviews, and then hears nothing for days. On the other side, a recruiter with dozens of open conversations has no reliable way to know which of them have gone quiet. Neither side is at fault: the tools were built to manage the process, not the conversation.",
  },
  {
    title: "Our approach",
    text: "Hirvello doesn't replace the people doing the hiring. It points out the conversations that have gone quiet and writes a first draft of the next message; a person reads it and decides. Nothing is sent, posted or decided without someone saying yes.",
  },
];

/** What Hirvello is for, as an editorial page: a headline, a few chapters, who it serves, and the way to reach us. */
export function AboutSection() {
  return (
    <Section
      level="h1"
      id="about"
      eyebrow="About"
      title="Hiring shouldn't go quiet."
      intro="Hirvello works on one problem: people who apply, interview, and then hear nothing back. It shows recruiters who is waiting, helps them write the update, and tells candidates what happens next."
    >
      <div className="mt-12 border-t border-ink/[0.08]">
        {CHAPTERS.map((chapter) => (
          <div key={chapter.title} className="grid gap-3 border-b border-ink/[0.08] py-8 md:grid-cols-[220px_1fr] md:gap-12">
            <h2 className="text-[18px] font-semibold tracking-[-0.01em] text-ink md:pt-0.5">{chapter.title}</h2>
            <p className="max-w-[640px] text-[17px] leading-relaxed text-pretty text-charcoal">{chapter.text}</p>
          </div>
        ))}
        <div className="grid gap-3 border-b border-ink/[0.08] py-8 md:grid-cols-[220px_1fr] md:gap-12">
          <h2 className="text-[18px] font-semibold tracking-[-0.01em] text-ink md:pt-0.5">Who we serve</h2>
          <ul className="flex max-w-[640px] flex-col gap-4">
            {SERVED.map(({ href, who, line }) => (
              <li key={href}>
                <Link href={href} className="group rounded-md text-[17px] leading-relaxed text-pretty text-charcoal">
                  <span className="font-semibold text-ink underline decoration-ink/20 underline-offset-4 transition-colors duration-200 group-hover:decoration-brand-ink">
                    {who}
                  </span>{" "}
                  {line}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-10 flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-[34rem] text-[17px] leading-relaxed text-charcoal">
          Questions, feedback, or a pilot in mind? We&apos;d like to hear from you. And if this is work you&apos;d want to
          do, see{" "}
          <Link href="/about/careers" className="font-medium text-brand-ink underline-offset-4 hover:underline">
            Careers
          </Link>
          .
        </p>
        <Link href="/contact" className={buttonStyles({ size: "lg", className: "group shrink-0" })}>
          Write to us
          <ArrowRight aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5" />
        </Link>
      </div>
    </Section>
  );
}
