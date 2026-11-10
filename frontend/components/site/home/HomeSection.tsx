import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type HomeSectionProps = {
  id: string;
  eyebrow: string;
  title: ReactNode;
  intro?: ReactNode;
  children: ReactNode;
  className?: string;
  /** wide: a 32 to 48px headline, for a section whose content is pictures (How it works). */
  size?: "default" | "wide";
};

/**
 * One section of the home page: a short label, a centred headline (28 to 40px; wide, 32 to 48px), a line of intro,
 * then its content. No background of its own (the page's home-sky runs behind every section), the same 1200px
 * column and side padding as the closing line and the footer, and 32 / 40 / 48px above and below, so the space
 * between two sections' content is about 64px on a phone, 80px on a tablet and 96px on a desktop.
 */
export function HomeSection({ id, eyebrow, title, intro, children, className, size = "default" }: HomeSectionProps) {
  const wide = size === "wide";
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={cn("scroll-mt-28 px-5 py-8 sm:px-8 sm:py-10 lg:py-12", className)}>
      <div className="mx-auto w-full max-w-[1200px]">
        <div className={cn("mx-auto text-center", wide ? "max-w-[920px]" : "max-w-[640px]")}>
          <p className="text-[0.9375rem] font-semibold text-brand-ink">
            {eyebrow}
          </p>
          <h2
            id={`${id}-title`}
            className={cn(
              "mt-3 text-balance text-ink",
              wide
                ? "text-[clamp(2rem,3.4vw,3rem)] leading-[1.08] font-bold tracking-[-0.03em]"
                : "text-[clamp(1.75rem,3vw,2.5rem)] leading-[1.12] font-semibold tracking-[-0.025em]",
            )}
          >
            {title}
          </h2>
          {intro && <p className={cn("mt-4 leading-relaxed text-pretty text-charcoal", wide ? "text-[1.0625rem] sm:text-[1.1875rem]" : "text-[1rem] sm:text-[1.0625rem]")}>{intro}</p>}
        </div>
        {children}
      </div>
    </section>
  );
}
