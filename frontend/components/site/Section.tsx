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
        <p className="flex items-center gap-2 text-[11.5px] font-medium tracking-[0.22em] text-charcoal/80 uppercase">
          <span aria-hidden className="size-1.5 rounded-full bg-accent" />
          {eyebrow}
        </p>
        <Heading
          id={`${id}-title`}
          className={cn(
            "mt-5 max-w-3xl font-medium text-ink",
            level === "h1"
              ? "text-[clamp(38px,5.4vw,68px)] leading-[1.0] tracking-[-0.045em]"
              : "text-[clamp(30px,4vw,50px)] leading-[1.04] tracking-[-0.04em]",
          )}
        >
          {title}
        </Heading>
        {intro && <div className="mt-5 max-w-2xl text-[17px] leading-relaxed text-charcoal sm:text-lg">{intro}</div>}
        {children}
      </div>
    </section>
  );
}

/** A small icon on a soft blue tile, for a feature or a step. */
export function FeatureIcon({ children }: { children: ReactNode }) {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-[12px] bg-accent-soft/80 text-brand-ink ring-1 ring-accent/10 [&_svg]:size-4">
      {children}
    </span>
  );
}
