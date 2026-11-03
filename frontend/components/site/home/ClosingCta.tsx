import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { SIGNUP_LINK } from "@/components/site/nav";
import { buttonStyles } from "@/components/ui/Button";

/** The home page's last word: one invitation, two ways to take it. */
export function ClosingCta() {
  return (
    <section aria-labelledby="closing-title" className="px-5 pt-2 pb-16 sm:px-8 sm:pb-20">
      <div className="sky-card mx-auto w-full max-w-[1200px] rounded-[24px] px-6 py-12 text-center sm:px-12 sm:py-14">
        <h2 id="closing-title" className="mx-auto max-w-[20ch] text-[clamp(28px,3vw,40px)] leading-[1.12] font-semibold tracking-[-0.025em] text-ink">
          Ready to hire with <span className="text-accent">more clarity?</span>
        </h2>
        <p className="mx-auto mt-4 max-w-[44ch] text-[16px] leading-relaxed text-charcoal sm:text-[17px]">
          Explore Hirvello and find the right people for your team.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
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
