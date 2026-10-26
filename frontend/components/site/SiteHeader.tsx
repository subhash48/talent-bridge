"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { SITE_SECTIONS, sectionHref } from "@/components/site/nav";
import { TalentBridgeLogo } from "@/components/shared/TalentBridgeLogo";
import { buttonStyles } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

const linkStyles =
  "rounded-[6px] px-2.5 py-1.5 text-[13px] font-medium text-stone transition-colors hover:bg-muted hover:text-ink";

/**
 * The public website's header: the sections of the home page, and Sign in, which asks who you are rather
 * than assuming a recruiter. Under the lg breakpoint the sections fold into a menu.
 */
export function SiteHeader() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-canvas/85 backdrop-blur supports-[backdrop-filter]:bg-canvas/70">
      <div className="mx-auto flex h-16 w-full max-w-[1080px] items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="rounded-[6px]" aria-label="TalentBridge home">
          <TalentBridgeLogo />
        </Link>
        <nav aria-label="Website" className="hidden items-center gap-0.5 lg:flex">
          {SITE_SECTIONS.map((section) => (
            <Link key={section.id} href={sectionHref(section.id)} className={linkStyles}>
              {section.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/signin" className={buttonStyles({ size: "md" })}>
            Sign in
          </Link>
          <button
            type="button"
            className={cn(buttonStyles({ variant: "ghost", size: "icon" }), "lg:hidden")}
            aria-expanded={open}
            aria-controls="site-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((shown) => !shown)}
          >
            {open ? <X aria-hidden /> : <Menu aria-hidden />}
          </button>
        </div>
      </div>
      {open && (
        <nav id="site-menu" aria-label="Website" className="border-t border-border bg-canvas lg:hidden">
          <ul className="mx-auto flex w-full max-w-[1080px] flex-col px-4 py-2 sm:px-6">
            {SITE_SECTIONS.map((section) => (
              <li key={section.id}>
                <Link
                  href={sectionHref(section.id)}
                  onClick={() => setOpen(false)}
                  className="block rounded-[8px] px-2 py-3 text-[15px] font-medium text-charcoal hover:bg-muted"
                >
                  {section.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  );
}
