import Link from "next/link";

import { HirvelloLogo } from "@/components/shared/HirvelloLogo";
import { COMPANY_LINKS, HOW_IT_WORKS_LINK, POLICY_LINKS, PRICING_LINK, PRODUCT_LINK, SOLUTIONS } from "@/components/site/nav";
import { cn } from "@/lib/utils";

// The footer's columns: the product, the solutions by name, then the company.
const COLUMNS: { title: string; links: readonly { href: string; label: string }[] }[] = [
  { title: "Product", links: [PRODUCT_LINK, HOW_IT_WORKS_LINK, PRICING_LINK] },
  { title: "Solutions", links: SOLUTIONS.map(({ href, short }) => ({ href, label: short })) },
  { title: "Company", links: COMPANY_LINKS },
];

const linkStyles = "rounded-sm text-[14px] text-charcoal transition-colors hover:text-ink";

/**
 * The public website's footer: the mark and its one line, every place on the site in three short columns, then the
 * policies and the year. Nothing more. A sheet of glass at the foot of the sky.
 */
export function SiteFooter({ className }: { className?: string }) {
  return (
    <footer className={cn("px-3 pb-3 sm:px-5 sm:pb-5", className)}>
      <div className="sky-card mx-auto w-full max-w-[1120px] rounded-[28px] px-6 py-8 sm:px-10 sm:py-10">
        <div className="flex flex-col gap-10 lg:flex-row lg:justify-between">
          <div className="max-w-xs">
            <Link href="/" aria-label="Hirvello home" className="inline-flex rounded-md">
              <HirvelloLogo />
            </Link>
            <p className="mt-4 text-[14px] leading-relaxed text-stone">
              Less noise, more signal: Hirvello finds the real candidates and keeps everyone in the hiring process informed.
            </p>
          </div>
          <nav aria-label="Footer" className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:gap-14">
            {COLUMNS.map((column) => (
              <div key={column.title}>
                <p className="text-[11px] font-semibold tracking-[0.16em] text-faint uppercase">{column.title}</p>
                <ul className="mt-3.5 flex flex-col gap-2.5">
                  {column.links.map((link) => (
                    <li key={link.href}>
                      <Link href={link.href} className={linkStyles}>
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>
        <p className="mt-10 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-ink/[0.07] pt-6 text-[13px] text-stone">
          {POLICY_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="rounded-sm transition-colors hover:text-ink">
              {link.label}
            </Link>
          ))}
          <span className="text-faint">© 2026 Hirvello</span>
        </p>
      </div>
    </footer>
  );
}
