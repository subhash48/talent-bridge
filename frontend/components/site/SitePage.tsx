import type { ReactNode } from "react";

import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";

/** A page of the public website: the floating header, the page (clear of the header) on the sky, the footer. */
export function SitePage({ children }: { children: ReactNode }) {
  return (
    <div className="sky-backdrop flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1 pt-16 sm:pt-20">{children}</main>
      <SiteFooter />
    </div>
  );
}

type PolicyPageProps = { title: string; updated: string; summary: ReactNode; children: ReactNode };

/** Privacy and Terms: a readable column, with a plain note that it's a draft and not legal advice. */
export function PolicyPage({ title, updated, summary, children }: PolicyPageProps) {
  return (
    <SitePage>
      <article className="mx-auto w-full max-w-[720px] px-5 py-16 sm:px-8 sm:py-20">
        <h1 className="text-[clamp(34px,5vw,52px)] leading-[1.04] font-semibold tracking-[-0.04em] text-ink">{title}</h1>
        <p className="mt-3 text-sm text-faint">Last updated {updated}</p>
        <div className="mt-8 rounded-[16px] bg-caution/[0.06] px-5 py-4 text-sm leading-relaxed text-charcoal ring-1 ring-caution/20">
          {summary}
        </div>
        <div className="mt-12 flex flex-col gap-9 text-[15px] leading-relaxed text-charcoal [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:tracking-[-0.01em] [&_h2]:text-ink [&_li]:mt-1.5 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5">
          {children}
        </div>
      </article>
    </SitePage>
  );
}
