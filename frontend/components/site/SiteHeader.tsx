"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { SITE_LINKS } from "@/components/site/nav";
import { KavuntraLogo } from "@/components/shared/KavuntraLogo";
import { buttonStyles } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

const linkStyles =
  "rounded-full px-3 py-1.5 text-[14px] text-charcoal transition-colors duration-200 hover:bg-ink/[0.05] hover:text-ink aria-[current=page]:text-ink aria-[current=page]:bg-ink/[0.05]";

/**
 * The public website's header: a floating pill over the page, with the website's places in the middle, then
 * Sign in (which asks who you are) and Get started. Wide screens give it 85% of the width, as in the approved
 * design; under the lg breakpoint the places fold into a menu.
 */
export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);

  return (
    <header className="fixed inset-x-0 top-0 z-40 px-3 pt-3 sm:px-5 sm:pt-5">
      <div className="mx-auto flex h-14 w-full max-w-[1680px] items-center justify-between gap-3 rounded-full bg-overlay/75 pr-2 pl-4 shadow-soft ring-1 ring-ink/[0.06] backdrop-blur-xl sm:pl-5 lg:pr-3 lg:pl-7 xl:w-[85vw]">
        <Link href="/" className="rounded-full py-1" aria-label="Kavuntra home">
          <KavuntraLogo />
        </Link>
        <nav aria-label="Website" className="hidden items-center gap-1.5 lg:flex">
          {SITE_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={pathname === link.href ? "page" : undefined}
              className={linkStyles}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-1 lg:gap-2">
          <Link href="/signin" className={cn(linkStyles, "hidden sm:inline-flex")}>
            Sign in
          </Link>
          <Link href="/start" className={buttonStyles({ size: "md", className: "h-[38px] rounded-full px-[18px] text-[14px]" })}>
            Get started
          </Link>
          <button
            type="button"
            className={cn(buttonStyles({ variant: "ghost", size: "icon" }), "rounded-full lg:hidden")}
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
        <nav
          id="site-menu"
          aria-label="Website"
          className="mx-auto mt-2 w-full max-w-[1120px] animate-pop-in rounded-[24px] bg-overlay/95 p-2 shadow-raised ring-1 ring-ink/[0.07] backdrop-blur-xl lg:hidden"
        >
          <ul className="flex flex-col">
            {[...SITE_LINKS, { href: "/signin", label: "Sign in" }].map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-[16px] px-4 py-3.5 text-base font-medium text-charcoal transition-colors hover:bg-ink/[0.05] hover:text-ink"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  );
}
