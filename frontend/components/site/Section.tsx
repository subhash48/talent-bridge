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

/**
 * One section of the public website: a short label, a headline, a line or two of intro, then its content. The page's
 * own headline is bold and 32 to 46px; a section's inside a longer page is semibold and a step smaller.
 */
export function Section({ id, eyebrow, title, intro, children, className, level = "h2" }: SectionProps) {
  const Heading = level;
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={cn("scroll-mt-28 py-14 sm:py-20", className)}>
      <div className="mx-auto w-full max-w-[1200px] px-5 sm:px-8">
        <p className="flex items-center gap-2 text-[12px] font-semibold tracking-[0.18em] text-charcoal uppercase">
          <span aria-hidden className="size-1.5 rounded-full bg-accent" />
          {eyebrow}
        </p>
        <Heading
          id={`${id}-title`}
          className={cn(
            "mt-4 max-w-3xl text-ink",
            level === "h1"
              ? "text-[clamp(32px,3.6vw,46px)] leading-[1.1] font-bold tracking-[-0.03em]"
              : "text-[clamp(26px,2.8vw,36px)] leading-[1.15] font-semibold tracking-[-0.02em]",
          )}
        >
          {title}
        </Heading>
        {intro && <div className="mt-4 max-w-2xl text-[16px] leading-relaxed text-charcoal sm:text-[17px]">{intro}</div>}
        {children}
      </div>
    </section>
  );
}

/** A small icon on a soft blue tile, for a feature or a step. */
export function FeatureIcon({ children }: { children: ReactNode }) {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-accent-soft/80 text-brand-ink ring-1 ring-accent/10 [&_svg]:size-4">
      {children}
    </span>
  );
}
