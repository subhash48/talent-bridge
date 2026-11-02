import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type HomeSectionProps = {
  id: string;
  eyebrow: string;
  title: ReactNode;
  intro?: ReactNode;
  children: ReactNode;
  className?: string;
};

/** One section of the home page: a short label, a centred headline, a line of intro, then its content. */
export function HomeSection({ id, eyebrow, title, intro, children, className }: HomeSectionProps) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={cn("scroll-mt-24 px-5 py-20 sm:px-8 sm:py-28", className)}>
      <div className="mx-auto w-full max-w-[1120px]">
        <div className="mx-auto max-w-2xl text-center">
          <p className="flex items-center justify-center gap-2 text-[11.5px] font-medium tracking-[0.22em] text-charcoal/80 uppercase">
            <span aria-hidden className="size-1.5 rounded-full bg-accent" />
            {eyebrow}
          </p>
          <h2 id={`${id}-title`} className="mt-5 text-[clamp(32px,4.6vw,56px)] leading-[1.02] font-medium tracking-[-0.04em] text-ink">
            {title}
          </h2>
          {intro && <p className="mt-5 text-[16px] leading-relaxed text-charcoal sm:text-[17px]">{intro}</p>}
        </div>
        {children}
      </div>
    </section>
  );
}
