import type { ReactNode } from "react";

import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";

/** A page of the public website: the header, the page, the footer. */
export function SitePage({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}

type PolicyPageProps = { title: string; updated: string; summary: ReactNode; children: ReactNode };

/** Privacy and Terms: a readable column, with a plain note that it's a draft and not legal advice. */
export function PolicyPage({ title, updated, summary, children }: PolicyPageProps) {
  return (
    <SitePage>
      <article className="mx-auto w-full max-w-[720px] px-4 py-16 sm:px-6">
        <h1 className="text-[34px] leading-tight font-semibold tracking-[-0.02em] text-ink sm:text-[42px]">{title}</h1>
        <p className="mt-2 text-sm text-faint">Last updated {updated}</p>
        <div className="mt-6 rounded-[12px] border border-caution/30 bg-caution/[0.06] px-4 py-3 text-sm leading-relaxed text-charcoal">
          {summary}
        </div>
        <div className="mt-10 flex flex-col gap-8 text-[15px] leading-relaxed text-charcoal [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-ink [&_li]:mt-1.5 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5">
          {children}
        </div>
      </article>
    </SitePage>
  );
}
