import { FlaskConical } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { EncordLogo } from "@/components/shared/EncordLogo";
import { buttonStyles } from "@/components/ui/Button";

/**
 * The public careers site's frame: the brand, a banner saying it's a development demo, and one calm
 * column. No sign-in and no sidebar; the same tokens and backdrop as the workspace and the portal.
 */
export function CareersShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[70] focus:rounded-[8px] focus:bg-ink focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-canvas"
      >
        Skip to content
      </a>
      <div aria-hidden className="app-backdrop pointer-events-none absolute inset-x-0 top-0 h-[520px]" />
      <p className="relative flex items-center justify-center gap-2 border-b border-caution/15 bg-caution/[0.08] px-4 py-2 text-center text-xs text-caution">
        <FlaskConical aria-hidden className="size-3.5 shrink-0" />
        Development demo — these roles are not real
      </p>
      <header className="relative">
        <div className="mx-auto flex h-[72px] w-full max-w-[1080px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-10">
          <Link href="/demo/careers" className="flex items-center gap-3 rounded-md">
            <EncordLogo />
            <span aria-hidden className="h-5 w-px bg-border-strong" />
            <span className="text-[15px] font-medium text-charcoal">Careers</span>
          </Link>
          {/* /login sends a signed-in candidate straight on to their portal. */}
          <Link href="/login?next=/candidate" prefetch={false} className={buttonStyles({ variant: "ghost", size: "sm" })}>
            <span className="sm:hidden">Sign in</span>
            <span className="hidden sm:inline">Candidate sign-in</span>
          </Link>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="relative mx-auto w-full max-w-[1080px] flex-1 px-4 pb-16 focus:outline-none sm:px-6 lg:px-10">
        {children}
      </main>
    </div>
  );
}
