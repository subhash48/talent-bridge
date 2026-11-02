import { MessageSquareText, Radar, Sparkles, type LucideIcon } from "lucide-react";

import { HomeSection } from "@/components/site/home/HomeSection";

// Three steps, in the order a hire happens: say who you need, see who's real, keep everyone informed.
const STEPS: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: Sparkles,
    title: "Say who you need",
    text: "In your own words, typed or spoken. Hirvello turns it into a job that's ready to post, and nothing goes out until you've seen it and said yes.",
  },
  {
    icon: Radar,
    title: "See the real ones",
    text: "Matches come with the reasons, taken from each person's own application: the work they've done, not a score. You choose whom to talk to.",
  },
  {
    icon: MessageSquareText,
    title: "Keep everyone informed",
    text: "Hirvello notices when a conversation has gone quiet and drafts the next update for you to review. Candidates always know where they stand.",
  },
];

/** How Hirvello works, in three steps. The header's "How it works" lands here. */
export function HowItWorks() {
  return (
    <HomeSection id="how-it-works" eyebrow="How it works" title="Three steps. No noise." intro="Hiring, with the signal kept and the guesswork removed.">
      <ol className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-5">
        {STEPS.map(({ icon: Icon, title, text }, index) => (
          <li key={title} className="reveal sky-card relative flex flex-col rounded-[24px] p-6 sm:p-7">
            <span className="flex items-center justify-between">
              <span className="flex size-10 items-center justify-center rounded-[12px] bg-accent-soft text-brand-ink ring-1 ring-accent/10">
                <Icon aria-hidden className="size-[18px]" strokeWidth={1.75} />
              </span>
              <span className="font-serif text-[22px] text-accent italic">0{index + 1}</span>
            </span>
            <h3 className="mt-6 text-[19px] leading-snug font-semibold tracking-[-0.02em] text-ink">{title}</h3>
            <p className="mt-2.5 text-[14.5px] leading-relaxed text-charcoal">{text}</p>
          </li>
        ))}
      </ol>
    </HomeSection>
  );
}
