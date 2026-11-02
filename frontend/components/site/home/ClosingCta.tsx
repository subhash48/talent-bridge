import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { SIGNUP_LINK } from "@/components/site/nav";
import { buttonStyles } from "@/components/ui/Button";

/** The home page's last word: one invitation, two ways to take it. */
export function ClosingCta() {
  return (
    <section aria-labelledby="closing-title" className="px-5 pt-2 pb-16 sm:px-8 sm:pb-20">
      <div className="sky-card relative mx-auto w-full max-w-[1200px] overflow-hidden rounded-[24px] px-6 py-12 text-center sm:px-12 sm:py-14">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -bottom-32 size-[400px] rounded-full bg-[radial-gradient(closest-side,rgb(50_102_255/0.32),transparent)] blur-2xl"
        />
        <p className="flex items-center justify-center gap-2 text-[12px] font-semibold tracking-[0.18em] text-charcoal uppercase">
          <span aria-hidden className="size-1.5 rounded-full bg-accent" />
          The beta is open
        </p>
        <h2 id="closing-title" className="relative mx-auto mt-4 max-w-[20ch] text-[clamp(28px,3vw,40px)] leading-[1.12] font-semibold tracking-[-0.025em] text-ink">
          Find the <span className="text-accent">real ones</span>, from your first hire.
        </h2>
        <p className="relative mx-auto mt-4 max-w-[44ch] text-[16px] leading-relaxed text-charcoal sm:text-[17px]">
          Explore with sample data, no commitment. Set up a workspace when you&rsquo;re ready.
        </p>
        <div className="relative mt-8 flex flex-wrap justify-center gap-3">
          <Link href={SIGNUP_LINK.href} className={buttonStyles({ size: "lg", className: "group px-6" })}>
            Get started
            <ArrowRight aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5" />
          </Link>
          <Link href="/contact" className={buttonStyles({ variant: "secondary", size: "lg", className: "px-6" })}>
            Talk to us
          </Link>
        </div>
      </div>
    </section>
  );
}
