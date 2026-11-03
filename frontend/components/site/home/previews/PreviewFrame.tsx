import { UserRound } from "lucide-react";
import type { ReactNode } from "react";

import { HirvelloMark } from "@/components/shared/HirvelloLogo";
import { cn } from "@/lib/utils";

type PreviewFrameProps = {
  /** What the picture shows, for screen readers: the picture itself is drawn, not read. */
  label: string;
  /** The app's tabs, as that part of Hirvello names them, and the one this view is on. */
  tabs: readonly string[];
  active: string;
  children: ReactNode;
};

/**
 * A picture of one Hirvello screen for the home page: a tinted tile, 4:3, holding the app's window with its mark,
 * tabs and account button, and the view under them. Everything inside is sized in em off one font size that
 * follows the tile's width (cqw), so the three pictures scale together and keep their proportions from a phone to
 * a wide screen. It's drawn with the site's own colours, sample data only, and nothing in it can be clicked.
 */
export function PreviewFrame({ label, tabs, active, children }: PreviewFrameProps) {
  return (
    <div className="@container">
      <figure
        role="img"
        aria-label={label}
        className="aspect-[4/3] overflow-hidden rounded-[22px] bg-accent-soft/55 p-[1.4em] text-[clamp(10.5px,3.15cqw,13px)] leading-snug text-ink ring-1 ring-accent-soft/80 select-none"
      >
        <div className="flex h-full flex-col overflow-hidden rounded-[14px] bg-accent-soft ring-1 ring-ink/[0.06]">
          <div className="flex items-center gap-[0.55em] border-b border-ink/[0.07] px-[1em] py-[0.7em]">
            <HirvelloMark className="h-[1.5em]" />
            <span className="text-[1.15em] leading-none font-bold tracking-[-0.035em] @max-[360px]:hidden">
              hir<span className="text-accent">v</span>ello
            </span>
            <span className="ml-auto flex items-center gap-[0.15em]">
              {tabs.map((tab) => (
                <span
                  key={tab}
                  className={cn(
                    "rounded-full px-[0.6em] py-[0.3em] text-[0.82em] font-medium whitespace-nowrap",
                    tab === active ? "bg-sky text-brand-ink" : "text-charcoal",
                  )}
                >
                  {tab}
                </span>
              ))}
            </span>
            <span className="flex size-[1.8em] shrink-0 items-center justify-center rounded-full bg-sky/70 text-brand-ink">
              <UserRound className="size-[1em]" strokeWidth={2} />
            </span>
          </div>
          <div className="flex min-h-0 flex-1 flex-col px-[1em] py-[0.85em]">{children}</div>
        </div>
      </figure>
    </div>
  );
}
