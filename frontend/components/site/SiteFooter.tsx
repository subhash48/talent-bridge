import Link from "next/link";

import { SITE_SECTIONS, sectionHref } from "@/components/site/nav";
import { TalentBridgeLogo } from "@/components/shared/TalentBridgeLogo";

const linkStyles = "rounded-sm text-sm text-stone transition-colors hover:text-ink";

/** The public website's footer: every section, and the Privacy and Terms pages. */
export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface/60">
      <div className="mx-auto grid w-full max-w-[1080px] gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.2fr_2fr]">
        <div>
          <TalentBridgeLogo />
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-stone">
            The communication layer between hiring teams and candidates.
          </p>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-3">
          {SITE_SECTIONS.map((section) => (
            <Link key={section.id} href={sectionHref(section.id)} className={linkStyles}>
              {section.label}
            </Link>
          ))}
          <Link href="/privacy" className={linkStyles}>
            Privacy
          </Link>
          <Link href="/terms" className={linkStyles}>
            Terms
          </Link>
        </nav>
      </div>
      <div className="border-t border-border">
        <p className="mx-auto w-full max-w-[1080px] px-4 py-5 text-[13px] text-faint sm:px-6">© 2026 TalentBridge</p>
      </div>
    </footer>
  );
}
