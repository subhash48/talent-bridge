import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { Concierge } from "@/components/site/home/Concierge";
import { HOW_IT_WORKS_LINK, PRODUCT_LINK } from "@/components/site/nav";
import { buttonStyles } from "@/components/ui/Button";

/**
 * The home page's opening: the sky, a small label, one headline in two lines with the words that matter in blue,
 * two short lines, two buttons, and the hiring concierge close under them, so its top is in view on a desktop
 * screen before anyone scrolls. Centred, and no wider than a comfortable page.
 */
export function Hero() {
  return (
    <section
      aria-labelledby="hero-title"
      className="relative isolate overflow-hidden px-5 pt-[120px] pb-16 text-center sm:px-8 lg:pt-[136px] lg:pb-20"
    >
      <div aria-hidden className="hero-sky absolute inset-0 -z-20" />
      {/* A soft curve at the foot, like a horizon, and a drifting glow behind the words. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-[40vw] left-1/2 -z-10 h-[56vw] w-[150vw] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(closest-side,rgb(255_255_255/0.7),rgb(214_230_253/0.45)_55%,transparent)] blur-2xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-[14%] left-1/2 -z-10 h-[40vh] w-[64vw] -translate-x-1/2 animate-drift rounded-full bg-[radial-gradient(closest-side,rgb(255_255_255/0.55),transparent)] blur-3xl motion-reduce:animate-none"
      />

      <p className="flex items-center justify-center gap-2 text-[12px] font-semibold tracking-[0.18em] text-charcoal uppercase">
        <span aria-hidden className="size-1.5 rounded-full bg-accent" />
        Less noise. More signal.
      </p>
      <h1
        id="hero-title"
        className="mx-auto mt-5 max-w-[1050px] text-[clamp(38px,4.8vw,68px)] leading-[1.06] font-bold tracking-[-0.03em] text-ink"
      >
        Talent is everywhere.
        <br />
        Find the <span className="text-accent">real ones.</span>
      </h1>
      <p className="mx-auto mt-6 max-w-[40ch] text-[17px] leading-[1.6] text-charcoal sm:text-[18px]">
        The résumé gets them noticed.
        <br />
        The work tells you who they are.
      </p>

      <Concierge className="mt-9" />
      <p className="mt-4 text-[12.5px] text-stone">Explore the beta. Sample data, no commitment.</p>
    </section>
  );
}
