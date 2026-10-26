import { BellRing, Compass, PenLine } from "lucide-react";

import { FeatureIcon, Section } from "@/components/site/Section";

const STEPS = [
  {
    icon: BellRing,
    who: "Recruiters",
    title: "Know who needs attention",
    text: "TalentBridge detects candidates who have gone too long without an update.",
  },
  {
    icon: PenLine,
    who: "Communicate",
    title: "Send thoughtful updates faster",
    text: "AI drafts personalized candidate communication while recruiters stay in control.",
  },
  {
    icon: Compass,
    who: "Candidates",
    title: "Know what happens next",
    text: "Candidates see their application status, interview information and preparation in one place.",
  },
];

/** The product in three steps. */
export function HowItWorks() {
  return (
    <Section id="product" eyebrow="Product" title="How TalentBridge works">
      <ol className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
        {STEPS.map(({ icon: Icon, who, title, text }, index) => (
          <li key={title} className="glass flex flex-col rounded-[14px] border border-border p-6">
            <div className="flex items-center justify-between">
              <FeatureIcon>
                <Icon aria-hidden strokeWidth={1.75} />
              </FeatureIcon>
              <span className="text-[13px] font-medium text-faint" aria-hidden>
                {index + 1}
              </span>
            </div>
            <p className="mt-5 text-[13px] font-semibold text-brand-ink">{who}</p>
            <h3 className="mt-1 text-lg font-semibold tracking-[-0.01em] text-ink">{title}</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-stone">{text}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}
