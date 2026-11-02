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

/** One section of the home page: a short label, a centred headline (28 to 40px), a line of intro, then its content. */
export function HomeSection({ id, eyebrow, title, intro, children, className }: HomeSectionProps) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={cn("scroll-mt-28 px-5 py-16 sm:px-8 sm:py-20", className)}>
      <div className="mx-auto w-full max-w-[1200px]">
        <div className="mx-auto max-w-[640px] text-center">
          <p className="flex items-center justify-center gap-2 text-[12px] font-semibold tracking-[0.18em] text-charcoal uppercase">
            <span aria-hidden className="size-1.5 rounded-full bg-accent" />
            {eyebrow}
          </p>
          <h2 id={`${id}-title`} className="mt-4 text-[clamp(28px,3vw,40px)] leading-[1.12] font-semibold tracking-[-0.025em] text-ink">
            {title}
          </h2>
          {intro && <p className="mt-4 text-[16px] leading-relaxed text-charcoal sm:text-[17px]">{intro}</p>}
        </div>
        {children}
      </div>
    </section>
  );
}
