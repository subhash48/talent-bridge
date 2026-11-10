import { ArrowRight, Search } from "lucide-react";
import Link from "next/link";

import { Concierge } from "@/components/site/home/Concierge";
import { HOW_IT_WORKS_LINK, JOBS_LINK, PRODUCT_LINK } from "@/components/site/nav";
import { buttonStyles } from "@/components/ui/Button";

/**
 * The home page's opening: the sky, a small label, one headline in two lines with the words that matter in blue,
 * two short lines, two buttons (the platform, and the job board for anyone looking for work) with a quieter link to
 * how it works, and the hiring concierge close under them, so its top is in view on a desktop screen before anyone
 * scrolls. Centred, and no wider than a comfortable page.
 */
export function Hero() {
  return (
    <section
      aria-labelledby="hero-title"
      className="relative isolate px-5 pt-[120px] pb-8 text-center sm:px-8 sm:pb-10 lg:pt-[136px] lg:pb-12"
    >
      {/* The hero's own sky, its horizon and its glow, on one layer that reaches 12rem past the hero and fades out
          there, so the hero melts into the page's sky (home-sky) instead of stopping at an edge. It clips its own
          overflow, so the wide horizon never makes the page scroll sideways. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[calc(100%+12rem)] overflow-hidden [mask-image:linear-gradient(to_bottom,#000_0%,#000_58%,transparent_100%)]"
      >
        <div className="hero-sky absolute inset-0" />
        {/* A soft curve at the foot, like a horizon, and a drifting glow behind the words. */}
        <div className="absolute bottom-[calc(12rem-40vw)] left-1/2 h-[56vw] w-[150vw] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(closest-side,rgb(255_255_255/0.7),rgb(214_230_253/0.45)_55%,transparent)] blur-2xl" />
        <div className="absolute top-[14%] left-1/2 h-[40vh] w-[64vw] -translate-x-1/2 animate-drift rounded-full bg-[radial-gradient(closest-side,rgb(255_255_255/0.55),transparent)] blur-3xl motion-reduce:animate-none" />
      </div>

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
      {/* On a phone the two buttons stack at one width with the link under them; from sm they share a row. */}
      <div className="mx-auto mt-8 flex max-w-[320px] flex-col items-stretch gap-3 sm:max-w-none sm:flex-row sm:flex-wrap sm:items-center sm:justify-center">
        <Link href={PRODUCT_LINK.href} className={buttonStyles({ size: "lg", className: "group px-6" })}>
          Explore the platform
          <ArrowRight aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5" />
        </Link>
        <Link href={JOBS_LINK.href} className={buttonStyles({ variant: "secondary", size: "lg", className: "px-6" })}>
          <Search aria-hidden className="text-brand-ink" />
          Browse jobs
        </Link>
        <Link
          href={HOW_IT_WORKS_LINK.href}
          className="inline-flex h-11 items-center justify-center rounded-full px-3 text-[15px] font-semibold text-ink underline-offset-4 transition-colors duration-200 hover:text-brand-ink hover:underline"
        >
          See how it works
        </Link>
      </div>

      <Concierge className="mt-12 lg:mt-14" />
    </section>
  );
}
