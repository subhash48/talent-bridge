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
      <ul className="mt-12 grid grid-cols-1 gap-12 lg:mt-14 lg:grid-cols-3 lg:gap-6 xl:gap-8">
        {SOLUTIONS.map(({ href, short }) => (
          <li key={href} className="reveal mx-auto w-full max-w-[520px] lg:max-w-none">
            <h3 className="px-1 text-[clamp(22px,1.8vw,26px)] leading-tight font-bold tracking-[-0.02em] text-ink">{short}</h3>
            <p className="mt-2 px-1 text-[16px] leading-relaxed text-charcoal">{LINES[href]}</p>
            <Link
              href={href}
              className="group mt-3 ml-1 inline-flex items-center gap-1.5 rounded-md text-[16px] font-semibold text-brand-ink transition-colors duration-200 hover:text-ink"
            >
              Learn more
              <ArrowRight aria-hidden className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </li>
        ))}
      </ul>
    </HomeSection>
  );
}
