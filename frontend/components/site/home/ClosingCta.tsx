import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { buttonStyles } from "@/components/ui/Button";

/** The home page's last word: one invitation, two ways to take it. */
export function ClosingCta() {
  return (
    <section aria-labelledby="closing-title" className="px-5 pt-4 pb-24 sm:px-8 sm:pb-32">
      <div className="sky-card relative mx-auto w-full max-w-[1120px] overflow-hidden rounded-[32px] px-6 py-16 text-center sm:px-12 sm:py-20">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -bottom-32 size-[420px] rounded-full bg-[radial-gradient(closest-side,rgb(47_107_255/0.35),transparent)] blur-2xl"
        />
        <p className="flex items-center justify-center gap-2 text-[11.5px] font-medium tracking-[0.22em] text-charcoal/80 uppercase">
          <span aria-hidden className="size-1.5 rounded-full bg-accent" />
          The beta is open
        </p>
        <h2 id="closing-title" className="relative mx-auto mt-5 max-w-[16ch] text-[clamp(32px,5vw,60px)] leading-[1.02] font-medium tracking-[-0.04em] text-ink">
          Find the <em className="font-serif font-normal text-accent italic">real ones</em>, from your first hire.
        </h2>
        <p className="relative mx-auto mt-5 max-w-[42ch] text-[16px] leading-relaxed text-charcoal">
          Explore with sample data, no commitment. Set up a workspace when you&rsquo;re ready.
        </p>
        <div className="relative mt-9 flex flex-wrap justify-center gap-3">
          <Link href="/start" className={buttonStyles({ size: "xl", className: "group" })}>
            Get started
            <ArrowRight aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5" />
          </Link>
          <Link href="/contact" className={buttonStyles({ variant: "glass", size: "xl" })}>
            Talk to us
          </Link>
        </div>
      </div>
    </section>
  );
}
