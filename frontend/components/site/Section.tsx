import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type SectionProps = {
  id: string;
  eyebrow: string;
  title: string;
  intro?: ReactNode;
  children?: ReactNode;
  className?: string;
};

/** One section of the public website: a short label, a headline, a line or two of intro, then its content. */
export function Section({ id, eyebrow, title, intro, children, className }: SectionProps) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn("scroll-mt-16 border-t border-border py-20 sm:py-24", className)}
    >
      <div className="mx-auto w-full max-w-[1080px] px-4 sm:px-6">
        <p className="text-[13px] font-semibold tracking-[0.08em] text-brand-ink uppercase">{eyebrow}</p>
        <h2
          id={`${id}-title`}
          className="mt-3 max-w-2xl text-[30px] leading-[1.1] font-semibold tracking-[-0.02em] text-ink sm:text-[40px]"
        >
          {title}
        </h2>
        {intro && <div className="mt-4 max-w-2xl text-[17px] leading-relaxed text-stone">{intro}</div>}
        {children}
      </div>
    </section>
  );
}

/** A small icon in the brand's soft lime, for a feature or a step. */
export function FeatureIcon({ children }: { children: ReactNode }) {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-brand-soft text-brand-ink ring-1 ring-brand-ink/20 [&_svg]:size-4">
      {children}
    </span>
  );
}
