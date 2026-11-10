import type { ComponentType } from "react";

import { HomeSection } from "@/components/site/home/HomeSection";
import { EvidencePreview } from "@/components/site/home/previews/EvidencePreview";
import { JobBriefPreview } from "@/components/site/home/previews/JobBriefPreview";
import { UpdatesPreview } from "@/components/site/home/previews/UpdatesPreview";

// Three steps, in the order a hire happens, each shown on the screen where it happens.
const STEPS: { title: string; text: string; Preview: ComponentType }[] = [
  { title: "Say who you need", text: "Describe your role. Review before posting.", Preview: JobBriefPreview },
  { title: "See the real ones", text: "See real evidence behind every match.", Preview: EvidencePreview },
  { title: "Keep everyone informed", text: "Keep candidates updated at every stage.", Preview: UpdatesPreview },
];

/**
 * How Hirvello works, in three steps: a picture of the product for each, then its number, its name and one line,
 * under the picture rather than in a card, straight on the home page's one sky (home-sky). Side by side from lg,
 * stacked (no wider than 520px) below it. The header's "How it works" lands here.
 */
export function HowItWorks() {
  return (
    <HomeSection
      id="how-it-works"
      size="wide"
      eyebrow="How it works"
      title="Three steps. No noise."
      intro="Hiring, with the signal kept and the guesswork removed."
    >
      <ol className="mt-12 grid grid-cols-1 gap-12 lg:mt-14 lg:grid-cols-3 lg:gap-6 xl:gap-8">
        {STEPS.map(({ title, text, Preview }, index) => (
          <li key={title} className="reveal mx-auto w-full max-w-[520px] lg:max-w-none">
            <Preview />
            <h3 className="mt-6 flex items-baseline gap-3 px-1 text-[clamp(1.375rem,1.8vw,1.625rem)] leading-tight font-bold tracking-[-0.02em] text-ink">
              <span aria-hidden className="text-[1rem] font-semibold tracking-normal text-brand-ink tabular-nums">
                0{index + 1}
              </span>
              {title}
            </h3>
            <p className="mt-2 px-1 text-[1rem] leading-relaxed text-charcoal">{text}</p>
          </li>
        ))}
      </ol>
    </HomeSection>
  );
}
