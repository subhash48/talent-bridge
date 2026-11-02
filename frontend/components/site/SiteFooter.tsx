import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ComponentProps } from "react";

import { HirvelloLogo } from "@/components/shared/HirvelloLogo";
import { COMPANY_LINKS, HOW_IT_WORKS_LINK, POLICY_LINKS, PRICING_LINK, PRODUCT_LINK, SIGNUP_LINK, SOLUTIONS } from "@/components/site/nav";
import { socialLinks, type SocialNetwork } from "@/components/site/social";
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

/** The two networks' marks, drawn in the same thin line as the site's other icons. */
function SocialIcon({ network, ...props }: ComponentProps<"svg"> & { network: SocialNetwork }) {
  const shared = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  if (network === "LinkedIn") {
    return (
      <svg aria-hidden="true" focusable="false" {...shared} {...props}>
        <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
        <rect x="2" y="9" width="4" height="12" />
        <circle cx="4" cy="4" r="2" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" focusable="false" {...shared} {...props}>
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  );
}

/**
 * The public website's footer, on the same sky as the page, with no card around it. First the last invitation
 * (Better hiring starts here, Get started), then the mark with its one line and where to follow Hirvello beside
 * the places on the site in three columns, then a thin rule, the year and the policies.
 */
export function SiteFooter({ className }: { className?: string }) {
  const social = socialLinks();
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
            <p className={cn("mt-7", headingStyles)}>Follow Hirvello</p>
            <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
              {social.map(({ network, href }) => (
                <li key={network}>
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Hirvello on ${network} (opens in a new tab)`}
                      className={cn("group inline-flex items-center gap-2", linkStyles)}
                    >
                      <SocialIcon network={network} className="size-[18px] text-stone transition-colors duration-200 group-hover:text-brand-ink" />
                      {network}
                    </a>
                  ) : (
                    // Not configured yet (HIRVELLO_*_URL): the name and its mark, and nowhere to go.
                    <span className="inline-flex items-center gap-2 text-[15px] text-stone">
                      <SocialIcon network={network} className="size-[18px] text-faint" />
                      {network}
                    </span>
                  )}
                </li>
              ))}
            </ul>
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
