import { ArrowRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { DEMO_LINK, SIGNUP_LINK } from "@/components/site/nav";
import { buttonStyles } from "@/components/ui/Button";

/** The home page's last word: one invitation, two ways to take it. */
export function ClosingCta() {
  return (
    <section aria-labelledby="closing-title" className="px-5 sm:px-8">
      <div className="mx-auto w-full max-w-[1200px] py-10 text-center sm:py-14">
        <h2 id="closing-title" className="text-[clamp(26px,2.4vw,34px)] leading-[1.15] font-semibold tracking-[-0.02em] text-balance text-ink">
          Ready to hire with <span className="text-accent">more clarity?</span>
        </h2>
        <p className="mx-auto mt-3 max-w-[46ch] text-[16px] leading-relaxed text-pretty text-charcoal sm:text-[17px]">
          Explore Hirvello and find the right people for your team.
        </p>
        <div className="mx-auto mt-7 flex max-w-[320px] flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
          <Link href={SIGNUP_LINK.href} className={buttonStyles({ size: "lg", className: "group px-6" })}>
            Get started
            <ArrowRight aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5" />
          </Link>
          <Link
            href={DEMO_LINK.href}
            className={buttonStyles({
              variant: "secondary",
              size: "lg",
              className: "group border-accent/50 bg-transparent px-6 text-brand-ink backdrop-blur-none hover:border-accent hover:bg-accent-soft/40",
            })}
          >
            {DEMO_LINK.label}
            <ArrowUpRight aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}
