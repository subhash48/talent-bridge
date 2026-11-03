import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { HomeSection } from "@/components/site/home/HomeSection";
import { SOLUTIONS } from "@/components/site/nav";

// What each audience gets from Hirvello, in one line.
const LINES: Record<string, string> = {
  "/for-recruiters": "Run a clearer hiring process.",
  "/for-candidates": "Know what happens next.",
  "/for-small-businesses": "Hire without the complexity.",
};

/** The three ways in: recruiters, candidates and small businesses, each a card that is the link to its page. */
export function Audiences() {
  return (
    <HomeSection
      id="solutions"
      size="wide"
      className="steps-sky [--sky-mask:linear-gradient(to_bottom,transparent_0%,#000_18%,#000_82%,transparent_100%)]"
      eyebrow="Who it's for"
      title="One product. Three ways in."
      intro="The right workspace for every side of hiring."
    >
      <ul className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
        {SOLUTIONS.map(({ href, short, text, icon: Icon }) => (
          <li key={href} className="reveal flex">
            <Link
              href={href}
              className="group sky-card flex w-full flex-col rounded-[18px] p-5 transition-[transform,background-color] duration-200 hover:-translate-y-0.5 hover:bg-glass-strong sm:p-6"
            >
              <span className="flex size-9 items-center justify-center rounded-[10px] bg-accent-soft text-brand-ink ring-1 ring-accent/10">
                <Icon aria-hidden className="size-[18px]" strokeWidth={1.75} />
              </span>
              <span className="mt-5 text-[18px] leading-snug font-semibold tracking-[-0.015em] text-ink">{short}</span>
              <span className="mt-1 text-[14px] text-stone">{text}</span>
              <span className="mt-3 text-[15px] leading-relaxed text-charcoal">{LINES[href]}</span>
              <span className="mt-5 inline-flex items-center gap-1.5 text-[14px] font-semibold text-brand-ink">
                Learn more
                <ArrowRight aria-hidden className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </HomeSection>
  );
}
