import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type SectionProps = {
  id: string;
  eyebrow: string;
  title: string;
  intro?: ReactNode;
  children?: ReactNode;
  className?: string;
  /** h1 when the section is the page (Recruiters, About…), h2 inside a longer page. */
  level?: "h1" | "h2";
};

/** One section of the public website: a short label, a headline, a line or two of intro, then its content. */
export function Section({ id, eyebrow, title, intro, children, className, level = "h2" }: SectionProps) {
  const Heading = level;
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={cn("scroll-mt-24 py-20 sm:py-28", className)}>
      <div className="mx-auto w-full max-w-[1120px] px-5 sm:px-8">
        <p className="text-[12px] font-semibold tracking-[0.18em] text-brand-ink/80 uppercase">{eyebrow}</p>
        <Heading
          id={`${id}-title`}
          className={cn(
            "mt-4 max-w-3xl font-semibold text-ink",
            level === "h1"
              ? "text-[clamp(36px,5vw,60px)] leading-[1.02] tracking-[-0.04em]"
              : "text-[clamp(30px,4vw,48px)] leading-[1.05] tracking-[-0.035em]",
          )}
        >
          {title}
        </Heading>
        {intro && <div className="mt-5 max-w-2xl text-[17px] leading-relaxed text-stone sm:text-lg">{intro}</div>}
        {children}
      </div>
    </section>
  );
}

/** A small icon on a soft sage tile, for a feature or a step. */
export function FeatureIcon({ children }: { children: ReactNode }) {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-accent-soft/70 text-brand-ink [&_svg]:size-4">
      {children}
    </span>
  );
}
