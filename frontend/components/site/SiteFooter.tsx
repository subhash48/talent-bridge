import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ComponentProps } from "react";

import { HirvelloLogo } from "@/components/shared/HirvelloLogo";
import { CONTACT_CHANNELS } from "@/components/site/contact";
import {
  COMPANY_LINKS,
  HOW_IT_WORKS_LINK,
  JOBS_LINK,
  POLICY_LINKS,
  PRICING_LINK,
  PRODUCT_LINK,
  SIGNUP_LINK,
  SOLUTIONS,
} from "@/components/site/nav";
import { socialLinks, type SocialNetwork } from "@/components/site/social";
import { buttonStyles } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

// The footer's columns: the product, who it's for by name (led by the job board, the one place that needs no
// account), then the company.
const COLUMNS: { title: string; links: readonly { href: string; label: string }[] }[] = [
  { title: "Product", links: [PRODUCT_LINK, HOW_IT_WORKS_LINK, PRICING_LINK] },
  {
    title: "For you",
    links: [{ href: JOBS_LINK.href, label: "Find jobs" }, ...SOLUTIONS.map(({ href, short }) => ({ href, label: short }))],
  },
  { title: "Company", links: COMPANY_LINKS },
];

// Charcoal rather than grey: the sky is at its bluest behind the footer, and grey there falls below AA contrast.
const headingStyles = "text-[12px] font-semibold tracking-[0.16em] text-charcoal uppercase";
const linkStyles = "rounded-sm text-[0.9375rem] text-charcoal transition-colors duration-200 hover:text-brand-ink";
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
 * the places on the site in three columns (For you starts with Find jobs) and, under them, the business and support addresses (mailto), then a
 * thin rule, the year and the policies. The home page ends on its
 * own closing line (ClosingCta), so it passes invitation={false} and the footer starts at the mark.
 */
export function SiteFooter({ className, invitation = true }: { className?: string; invitation?: boolean }) {
  const social = socialLinks();
  return (
    <footer className={cn("px-5 pb-8 sm:px-8 sm:pb-10", invitation ? "pt-10 sm:pt-14" : "pt-8 sm:pt-10 lg:pt-12", className)}>
      <div className="mx-auto w-full max-w-[1200px]">
        {invitation && (
          <div className={cn("flex flex-col gap-6 border-b pb-10 sm:pb-12 lg:flex-row lg:items-end lg:justify-between lg:gap-12", rule)}>
            <div>
              <h2 className="text-[clamp(1.875rem,3vw,2.5rem)] leading-[1.1] font-semibold tracking-[-0.025em] text-ink">Better hiring starts here.</h2>
              <p className="mt-3 max-w-[44ch] text-[1rem] leading-relaxed text-charcoal sm:text-[1.0625rem]">Less noise. More signal. See the work behind every résumé.</p>
            </div>
            <Link href={SIGNUP_LINK.href} className={buttonStyles({ size: "lg", className: "group w-fit shrink-0 px-6" })}>
              Get started
              <ArrowRight aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </div>
        )}

        <div className={cn("grid gap-10 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,2fr)] lg:gap-16", invitation && "pt-10 sm:pt-12")}>
          <div>
            <Link href="/" aria-label="Hirvello home" className="inline-flex rounded-md">
              <HirvelloLogo />
            </Link>
            <p className="mt-4 max-w-[30ch] text-[0.9375rem] leading-relaxed text-charcoal sm:text-[1rem]">Find real talent. See the work behind the résumé.</p>
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
                      <SocialIcon network={network} className="size-[1.125rem] text-stone transition-colors duration-200 group-hover:text-brand-ink" />
                      {network}
                    </a>
                  ) : (
                    // Not configured yet (HIRVELLO_*_URL): the name and its mark, and nowhere to go.
                    <span className="inline-flex items-center gap-2 text-[0.9375rem] text-charcoal">
                      <SocialIcon network={network} className="size-[1.125rem] text-stone" />
                      {network}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
          <div>
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
            {/* Where to write: on the same columns as the links above, one under the other on a phone. */}
            <dl className="mt-10 grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-3">
              {CONTACT_CHANNELS.map(({ title, email }) => (
                <div key={email}>
                  <dt className={headingStyles}>{title}</dt>
                  <dd className="mt-3">
                    <a href={`mailto:${email}`} className={linkStyles}>
                      {email}
                    </a>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        <div className={cn("mt-12 flex flex-col gap-3 border-t pt-6 text-[13px] text-charcoal sm:mt-14 sm:flex-row sm:items-center sm:justify-between", rule)}>
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
