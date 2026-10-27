"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { SITE_LINKS } from "@/components/site/nav";
import { KavuntraLogo } from "@/components/shared/KavuntraLogo";
import { buttonStyles } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

// Light glass over the landscape: a warm stone tint the sky shows through, a hairline edge and the softest shadow.
const GLASS =
  "bg-[rgb(244_241_233/0.58)] ring-1 ring-ink/[0.07] shadow-[0_8px_28px_-14px_rgb(20_42_46/0.22)] backdrop-blur-md backdrop-saturate-150";

const linkStyles =
  "rounded-full px-2.5 py-1.5 text-[13.5px] text-charcoal transition-colors duration-200 hover:bg-ink/[0.06] hover:text-ink aria-[current=page]:text-ink aria-[current=page]:bg-ink/[0.06]";

/**
 * The public website's header: a small floating pill over the page, with the website's places centred in it, then
 * Sign in (which asks who you are) and Get started. On desktop it takes about three quarters of the width, and more
 * only if its contents need it; under xl the places fold into a menu rather than squeezing in.
 */
export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const pill = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);

  // Escape closes the menu and gives focus back to its button; so does a click anywhere outside the header's pill.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      toggle.current?.focus();
    };
    const onPointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !pill.current?.contains(event.target)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <header className="fixed inset-x-0 top-0 z-40 px-3 pt-3 sm:px-5 md:pt-[18px]">
      <div
        ref={pill}
        className={cn(
          "relative mx-auto grid h-12 w-full grid-cols-[1fr_auto_1fr] items-center gap-4 rounded-full px-1.5 md:h-[52px] md:w-[76vw] md:max-w-[1480px] md:min-w-max md:px-[7px]",
          GLASS,
        )}
      >
        <Link href="/" className="ml-2.5 justify-self-start rounded-full py-1 md:ml-[13px]" aria-label="Kavuntra home">
          <KavuntraLogo />
        </Link>
        <nav aria-label="Website" className="hidden items-center gap-0.5 xl:flex">
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
        <div className="col-start-3 flex items-center gap-1 justify-self-end md:gap-1.5">
          <Link href="/signin" className={cn(linkStyles, "hidden sm:inline-flex")}>
            Sign in
          </Link>
          <Link
            href="/start"
            className={buttonStyles({
              size: "md",
              className: "h-9 rounded-full px-4 text-[13px] md:h-[38px] md:px-[18px] md:text-[13.5px]",
            })}
          >
            Get started
          </Link>
          <button
            ref={toggle}
            type="button"
            className={cn(buttonStyles({ variant: "ghost", size: "icon" }), "rounded-full text-ink xl:hidden")}
            aria-expanded={open}
            aria-controls="site-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((shown) => !shown)}
          >
            {open ? <X aria-hidden /> : <Menu aria-hidden />}
          </button>
        </div>

        {open && (
          <nav
            id="site-menu"
            aria-label="Website"
            className="absolute top-full right-0 mt-2 w-[min(17rem,calc(100vw-1.5rem))] animate-pop-in rounded-[20px] bg-[rgb(246_243_236/0.95)] p-1.5 shadow-raised ring-1 ring-ink/[0.07] backdrop-blur-xl xl:hidden"
          >
            <ul className="flex flex-col">
              {[...SITE_LINKS, { href: "/signin", label: "Sign in" }].map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={() => setOpen(false)}
                    aria-current={pathname === link.href ? "page" : undefined}
                    className="block rounded-[14px] px-3.5 py-2.5 text-[15px] text-charcoal transition-colors hover:bg-ink/[0.06] hover:text-ink aria-[current=page]:bg-ink/[0.06] aria-[current=page]:text-ink"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>
    </header>
  );
}
