import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { Section } from "@/components/site/Section";
import { buttonStyles } from "@/components/ui/Button";

// What Hirvello does, in the order it happens to a hire: the gap is noticed, the update drafted, the candidate kept
// in the picture and prepared; and Simple Hire, the whole of it for a small business.
const FEATURES: { title: string; text: string; href: string; more: string }[] = [
  {
    title: "It notices who's waiting",
    text: "Today shows a recruiter which candidates are waiting on them: a stage change nobody mentioned, a question with no reply, a silence longer than your team allows.",
    href: "/for-recruiters",
    more: "More for recruiters",
  },
  {
    title: "It drafts the update",
    text: "For each candidate a recruiter picks, one message written from that person's own application. The recruiter reads it first, and nothing goes out until they approve.",
    href: "/for-recruiters",
    more: "More for recruiters",
  },
  {
    title: "Candidates see where they stand",
    text: "One portal for every application: the stage it's at, what comes next, the messages and the interviews.",
    href: "/for-candidates",
    more: "More for candidates",
  },
  {
    title: "Help before the interview",
    text: "Before an interview, the portal helps the candidate prepare for that role and that stage, so they don't walk in guessing.",
    href: "/for-candidates",
    more: "More for candidates",
  },
  {
    title: "Simple Hire, for small employers",
    text: "Say who you need, typed or out loud, and Simple Hire turns it into a job that's ready to post. Nothing is posted or sent until you've seen it and said yes.",
    href: "/for-small-businesses",
    more: "More for small businesses",
  },
];

/** The product, concisely: what Hirvello does, one numbered row each, and where to read more about it. */
export function ProductSection() {
  return (
    <Section
      level="h1"
      id="product"
      eyebrow="Product"
      title="What Hirvello does."
      intro="Most hiring tools manage the process. Hirvello looks after the conversation around it: it notices when one has gone quiet, drafts the next update for a recruiter to review, and shows each candidate where they stand."
    >
      <ol className="mt-12 border-t border-ink/[0.08]">
        {FEATURES.map(({ title, text, href, more }, index) => (
          <li key={title} className="grid gap-3 border-b border-ink/[0.08] py-7 md:grid-cols-[minmax(0,340px)_1fr] md:gap-12 md:py-8">
            <h2 className="flex items-baseline gap-3 text-[1.25rem] leading-snug font-semibold tracking-[-0.015em] text-balance text-ink">
              <span aria-hidden className="text-[0.9375rem] font-semibold text-accent tabular-nums">
                0{index + 1}
              </span>
              {title}
            </h2>
            <div className="max-w-[620px]">
              <p className="text-[1rem] leading-relaxed text-pretty text-charcoal sm:text-[1.0625rem]">{text}</p>
              <Link
                href={href}
                className="group mt-3 inline-flex items-center gap-1.5 rounded-sm text-[0.9375rem] font-semibold text-brand-ink transition-colors duration-200 hover:text-ink"
              >
                {more}
                <ArrowRight aria-hidden className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-12 flex flex-wrap items-center gap-3">
        <Link href="/start" className={buttonStyles({ size: "lg", className: "group" })}>
          Get started
          <ArrowRight aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5" />
        </Link>
        <Link href="/#how-it-works" className={buttonStyles({ variant: "secondary", size: "lg" })}>
          See how it works
        </Link>
      </div>
    </Section>
  );
}
