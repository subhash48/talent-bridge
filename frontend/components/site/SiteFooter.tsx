import Link from "next/link";

import { COMPANY_LINKS, POLICY_LINKS, PRODUCT_LINK, SOLUTIONS } from "@/components/site/nav";
import { KavuntraLogo } from "@/components/shared/KavuntraLogo";
import { cn } from "@/lib/utils";

// The footer's places: Product, the solutions by name, then the company. The policies sit on the line below.
const PLACES = [PRODUCT_LINK, ...SOLUTIONS.map(({ href, short }) => ({ href, label: short })), ...COMPANY_LINKS];

function FooterLinks({ className }: { className?: string }) {
  const linkStyles = "rounded-sm text-sm text-stone transition-colors hover:text-ink";
  return (
    <nav aria-label="Footer" className={cn("flex flex-wrap gap-x-5 gap-y-2.5", className)}>
      {PLACES.map((link) => (
        <Link key={link.href} href={link.href} className={linkStyles}>
          {link.label}
        </Link>
      ))}
    </nav>
  );
}

function Policies({ className }: { className?: string }) {
  return (
    <p className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-stone", className)}>
      {POLICY_LINKS.map((link) => (
        <Link key={link.href} href={link.href} className="rounded-sm transition-colors hover:text-ink">
          {link.label}
        </Link>
      ))}
      <span className="text-faint">© 2026 Kavuntra</span>
    </p>
  );
}

/**
 * The public website's footer: the mark, every place on the site, the policies and the year. Nothing more. On the
 * home page it's a floating bar over the film's last frames, like the header; elsewhere it sits at the foot of
 * the page.
 */
export function SiteFooter({ overFilm = false }: { overFilm?: boolean }) {
  if (overFilm) {
    return (
      <footer className="relative px-3 pt-[28vh] pb-3 sm:px-5 sm:pb-5">
        <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-5 rounded-[28px] bg-overlay/90 px-6 py-6 shadow-soft ring-1 ring-ink/[0.07] backdrop-blur-xl lg:flex-row lg:items-center lg:gap-8 lg:rounded-full lg:py-3.5 lg:pr-8 lg:pl-6">
          <Link href="/" aria-label="Kavuntra home" className="w-fit rounded-md">
            <KavuntraLogo />
          </Link>
          <FooterLinks className="lg:ml-auto" />
          <Policies />
        </div>
      </footer>
    );
  }
  return (
    <footer className="border-t border-border px-5 sm:px-8">
      <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-8 py-12 md:flex-row md:items-center md:justify-between">
        <Link href="/" aria-label="Kavuntra home" className="w-fit rounded-md">
          <KavuntraLogo />
        </Link>
        <FooterLinks className="gap-x-6 gap-y-3" />
      </div>
      <Policies className="mx-auto w-full max-w-[1120px] pb-10" />
    </footer>
  );
}
