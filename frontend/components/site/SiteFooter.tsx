import Link from "next/link";

import { FOOTER_LINKS } from "@/components/site/nav";
import { KavuntraLogo } from "@/components/shared/KavuntraLogo";

const linkStyles = "rounded-sm text-sm text-stone transition-colors hover:text-ink";

/**
 * The public website's footer: the mark, every place on the site, and the year. Nothing more. On the home page
 * it's a floating bar over the film's last frames, like the header; elsewhere it sits at the foot of the page.
 */
export function SiteFooter({ overFilm = false }: { overFilm?: boolean }) {
  if (overFilm) {
    return (
      <footer className="relative px-3 pt-[28vh] pb-3 sm:px-5 sm:pb-5">
        <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-5 rounded-[28px] bg-overlay/90 px-6 py-6 shadow-soft ring-1 ring-ink/[0.07] backdrop-blur-xl lg:flex-row lg:items-center lg:gap-8 lg:rounded-full lg:py-3.5 lg:pr-8 lg:pl-6">
          <Link href="/" aria-label="Kavuntra home" className="w-fit rounded-md">
            <KavuntraLogo />
          </Link>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2.5 lg:ml-auto">
            {FOOTER_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className="rounded-sm text-sm text-charcoal transition-colors hover:text-ink">
                {link.label}
              </Link>
            ))}
          </nav>
          <p className="text-[13px] text-stone">© 2026 Kavuntra</p>
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
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-3">
          {FOOTER_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className={linkStyles}>
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
      <p className="mx-auto w-full max-w-[1120px] pb-10 text-[13px] text-faint">© 2026 Kavuntra</p>
    </footer>
  );
}
