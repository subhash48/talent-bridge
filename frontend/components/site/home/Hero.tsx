import { Concierge } from "@/components/site/home/Concierge";
import { RotatingWord } from "@/components/site/home/RotatingWord";

const WORDS = ["Skill.", "Signal.", "Craft.", "Care."] as const;

/**
 * The home page's opening: the sky, one headline with the word that matters in serif, two short lines, and the
 * hiring concierge. Spacious and centred; nothing floats beside it.
 */
export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="relative isolate flex min-h-[100svh] flex-col items-center justify-center overflow-hidden px-5 pt-28 pb-20 text-center sm:px-8 sm:pt-32">
      <div aria-hidden className="hero-sky absolute inset-0 -z-20" />
      {/* A soft curve at the foot, like a horizon, and a drifting glow behind the words. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-[42vw] left-1/2 -z-10 h-[60vw] w-[150vw] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(closest-side,rgb(255_255_255/0.75),rgb(214_230_253/0.5)_55%,transparent)] blur-2xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-[28%] left-1/2 -z-10 h-[46vh] w-[70vw] -translate-x-1/2 animate-drift rounded-full bg-[radial-gradient(closest-side,rgb(255_255_255/0.6),transparent)] blur-3xl motion-reduce:animate-none"
      />

      <p className="flex items-center gap-2 text-[11.5px] font-medium tracking-[0.22em] text-charcoal/80 uppercase">
        <span aria-hidden className="size-1.5 rounded-full bg-accent" />
        Less noise. More signal.
      </p>
      <h1
        id="hero-title"
        className="mt-8 max-w-[14ch] text-[clamp(44px,8.2vw,104px)] leading-[0.98] font-normal tracking-[-0.045em] text-ink"
      >
        Talent is everywhere.
        <br />
        Find the{" "}
        <em className="font-serif font-normal tracking-[-0.02em] text-accent italic">real ones.</em>
      </h1>
      <p className="mt-7 text-[11.5px] font-semibold tracking-[0.26em] text-brand-ink uppercase">
        <RotatingWord words={WORDS} />
      </p>
      <p className="mt-6 max-w-[34ch] text-[16px] leading-relaxed text-charcoal sm:text-[17px]">
        The résumé gets them noticed.
        <br />
        The work tells you who they are.
      </p>

      <Concierge className="mt-9" />
      <p className="mt-4 text-[12.5px] text-stone">Explore the beta. Sample data, no commitment.</p>
    </section>
  );
}
