import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { HirvelloLogo } from "@/components/shared/HirvelloLogo";
import { COMPANY_LINKS, HOW_IT_WORKS_LINK, POLICY_LINKS, PRICING_LINK, PRODUCT_LINK, SIGNUP_LINK, SOLUTIONS } from "@/components/site/nav";
import { buttonStyles } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

// The footer's columns: the product, who it's for by name, then the company.
const COLUMNS: { title: string; links: readonly { href: string; label: string }[] }[] = [
  { title: "Product", links: [PRODUCT_LINK, HOW_IT_WORKS_LINK, PRICING_LINK] },
  { title: "For you", links: SOLUTIONS.map(({ href, short }) => ({ href, label: short })) },
  { title: "Company", links: COMPANY_LINKS },
];

const headingStyles = "text-[12px] font-semibold tracking-[0.16em] text-stone uppercase";
const linkStyles = "rounded-sm text-[15px] text-charcoal transition-colors duration-200 hover:text-brand-ink";
const rule = "border-ink/[0.08]";

/**
 * The public website's footer, on the same sky as the page, with no card around it. First the last invitation
 * (Better hiring starts here, Get started), then the mark with its one line beside the places on the site in three
 * columns, then a thin rule, the year and the policies.
 */
export function SiteFooter({ className }: { className?: string }) {
  return (
    <footer className={cn("px-5 pt-10 pb-8 sm:px-8 sm:pt-14 sm:pb-10", className)}>
      <div className="mx-auto w-full max-w-[1200px]">
        <div className={cn("flex flex-col gap-6 border-b pb-10 sm:pb-12 lg:flex-row lg:items-end lg:justify-between lg:gap-12", rule)}>
          <div>
            <h2 className="text-[clamp(30px,3vw,40px)] leading-[1.1] font-semibold tracking-[-0.025em] text-ink">Better hiring starts here.</h2>
            <p className="mt-3 max-w-[44ch] text-[16px] leading-relaxed text-charcoal sm:text-[17px]">Less noise. More signal. See the work behind every résumé.</p>
          </div>
          <Link href={SIGNUP_LINK.href} className={buttonStyles({ size: "lg", className: "group w-fit shrink-0 px-6" })}>
            Get started
            <ArrowRight aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5" />
          </Link>
        </div>

        <div className="grid gap-10 pt-10 sm:pt-12 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,2fr)] lg:gap-16">
          <div>
            <Link href="/" aria-label="Hirvello home" className="inline-flex rounded-md">
              <HirvelloLogo />
            </Link>
            <p className="mt-4 max-w-[30ch] text-[15px] leading-relaxed text-charcoal sm:text-[16px]">Find real talent. See the work behind the résumé.</p>
          </div>
          <nav aria-label="Footer" className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 sm:gap-x-8">
            {COLUMNS.map((column) => (
              <div key={column.title}>
                <p className={headingStyles}>{column.title}</p>
                <ul className="mt-4 flex flex-col gap-2.5">
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

        <div className={cn("mt-12 flex flex-col gap-3 border-t pt-6 text-[13px] text-stone sm:mt-14 sm:flex-row sm:items-center sm:justify-between", rule)}>
          <p>© 2026 Hirvello</p>
          <ul className="flex items-center gap-5">
            {POLICY_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="rounded-sm transition-colors duration-200 hover:text-ink">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
