import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type HomeSectionProps = {
  id: string;
  eyebrow: string;
  title: ReactNode;
  intro?: ReactNode;
  children: ReactNode;
  className?: string;
  /** wide: a 1280px page and a 32 to 48px headline, for a section whose content is pictures (How it works). */
  size?: "default" | "wide";
};

/**
 * One section of the home page: a short label, a centred headline (28 to 40px; wide, 32 to 48px), a line of intro,
 * then its content.
 */
export function HomeSection({ id, eyebrow, title, intro, children, className, size = "default" }: HomeSectionProps) {
  const wide = size === "wide";
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={cn("scroll-mt-28 px-5 py-16 sm:px-8 sm:py-20", className)}>
      <div className={cn("mx-auto w-full", wide ? "max-w-[1280px]" : "max-w-[1200px]")}>
        <div className={cn("mx-auto text-center", wide ? "max-w-[760px]" : "max-w-[640px]")}>
          <p className="flex items-center justify-center gap-2 text-[12px] font-semibold tracking-[0.18em] text-charcoal uppercase">
            <span aria-hidden className="size-1.5 rounded-full bg-accent" />
            {eyebrow}
          </p>
          <h2
            id={`${id}-title`}
            className={cn(
              "mt-4 text-ink",
              wide
                ? "text-[clamp(32px,3.4vw,48px)] leading-[1.08] font-bold tracking-[-0.03em]"
                : "text-[clamp(28px,3vw,40px)] leading-[1.12] font-semibold tracking-[-0.025em]",
            )}
          >
            {title}
          </h2>
          {intro && <p className={cn("mt-4 leading-relaxed text-charcoal", wide ? "text-[17px] sm:text-[19px]" : "text-[16px] sm:text-[17px]")}>{intro}</p>}
        </div>
        {children}
      </div>
    </section>
  );
}
