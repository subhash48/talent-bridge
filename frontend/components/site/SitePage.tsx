import type { ReactNode } from "react";

import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";

/** The first stop for a keyboard: hidden until focused, then a pill at the top left that jumps past the header. */
export function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only rounded-full bg-ink px-4 py-2 text-[0.875rem] font-semibold text-on-brand focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60]"
    >
      Skip to content
    </a>
  );
}

/** A page of the public website: the floating header, the page (clear of the header) on the sky, the footer. */
export function SitePage({ children }: { children: ReactNode }) {
  return (
    <div className="sky-backdrop flex min-h-dvh flex-col">
      <SkipLink />
      <SiteHeader />
      <main id="main" className="flex-1 pt-24 sm:pt-28">{children}</main>
      <SiteFooter />
    </div>
  );
}

type PolicyPageProps = { title: string; updated: string; summary: ReactNode; children: ReactNode };

/** Privacy and Terms: a readable column, with a plain note that it's a draft and not legal advice. */
export function PolicyPage({ title, updated, summary, children }: PolicyPageProps) {
  return (
    <SitePage>
      <article className="mx-auto w-full max-w-[760px] px-5 py-10 sm:px-8 sm:py-12">
        <div className="sky-card rounded-[22px] px-6 py-8 sm:px-10 sm:py-10">
          <h1 className="text-[clamp(1.875rem,3.4vw,2.625rem)] leading-[1.1] font-bold tracking-[-0.03em] text-ink">{title}</h1>
          <p className="mt-2.5 text-sm text-faint">Last updated {updated}</p>
          <div className="mt-6 rounded-[14px] bg-caution/[0.06] px-5 py-4 text-sm leading-relaxed text-charcoal ring-1 ring-caution/20">
            {summary}
          </div>
          <div className="mt-10 flex flex-col gap-8 text-[1rem] leading-relaxed text-pretty text-charcoal [&_h2]:text-[1.25rem] [&_h2]:font-semibold [&_h2]:tracking-[-0.01em] [&_h2]:text-ink [&_li]:mt-1.5 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5">
            {children}
          </div>
        </div>
      </article>
    </SitePage>
  );
}
