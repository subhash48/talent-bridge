"use client";

import { ArrowUpRight, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { HirvelloLogo } from "@/components/shared/HirvelloLogo";
import { DEMO_LINK, HOME_LINK, HOW_IT_WORKS_LINK, LOGIN_LINK, PRICING_LINK, PRODUCT_LINK, SIGNUP_LINK } from "@/components/site/nav";
import { buttonStyles } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

/** The places in the bar, in order. The solutions and the company pages are in the footer. */
const PLACES = [HOME_LINK, PRODUCT_LINK, HOW_IT_WORKS_LINK, PRICING_LINK] as const;

// Navy text at 16px with nothing behind it; the place you're on is a shade heavier, and blue under the pointer.
const linkStyles =
  "inline-flex h-10 items-center gap-1 rounded-md text-[16px] font-medium whitespace-nowrap text-ink transition-colors duration-200 hover:text-brand-ink aria-[current=page]:font-semibold";
const menuLinkStyles =
  "flex h-12 items-center gap-1 rounded-[10px] px-3 text-[16px] font-medium text-ink transition-colors hover:bg-ink/[0.04] aria-[current=page]:font-semibold";

/**
 * The public website's header: the logo on the left, Home, Product, How it works and Pricing in the middle, then
 * Log in, Book a demo and Sign up on the right, all straight on the sky with one thin line under them. No box, no
 * shadow: the bar is clear, and only turns solid while its menu is open. Under lg the places fold into one menu
 * behind a button, and the bar keeps the logo, Sign up and that button.
 */
export function SiteHeader() {
  const pathname = usePathname();
  // The menu remembers the page it was opened on, so leaving that page by any means closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const setOpen = (value: boolean) => setOpenOn(value ? pathname : null);
  const header = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const close = () => setOpen(false);
  const current = (href: string) => (pathname === href ? "page" : undefined);

  // Escape closes the menu and gives focus back to its button; so does a click, or focus moving, outside the header.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpenOn(null);
      menuButton.current?.focus();
    };
    const outside = (event: Event) => {
      if (event.target instanceof Node && !header.current?.contains(event.target)) setOpenOn(null);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", outside);
    window.addEventListener("focusin", outside);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", outside);
      window.removeEventListener("focusin", outside);
    };
  }, [open]);

  return (
    <header
      ref={header}
      className={cn("fixed inset-x-0 top-0 z-40 transition-[background-color] duration-200", open && "bg-canvas")}
    >
      <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center justify-between px-5 sm:px-8 lg:grid lg:h-20 lg:grid-cols-[1fr_auto_1fr] xl:px-10">
        <Link href="/" className="justify-self-start rounded-md" aria-label="Hirvello home">
          <HirvelloLogo />
        </Link>

        <nav aria-label="Website" className="hidden items-center gap-6 lg:flex xl:gap-9">
          {PLACES.map((place) => (
            <Link key={place.href} href={place.href} aria-current={current(place.href)} className={linkStyles}>
              {place.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2 lg:col-start-3 lg:justify-self-end lg:gap-5 xl:gap-7">
          <Link href={LOGIN_LINK.href} aria-current={current(LOGIN_LINK.href)} className={cn(linkStyles, "hidden lg:inline-flex")}>
            {LOGIN_LINK.label}
          </Link>
          <Link href={DEMO_LINK.href} aria-current={current(DEMO_LINK.href)} className={cn(linkStyles, "hidden lg:inline-flex")}>
            {DEMO_LINK.label}
            <ArrowUpRight aria-hidden className="size-4" strokeWidth={2} />
          </Link>
          <Link href={SIGNUP_LINK.href} className={buttonStyles({ size: "lg", className: "px-5" })}>
            {SIGNUP_LINK.label}
          </Link>
          <button
            ref={menuButton}
            type="button"
            className={cn(buttonStyles({ variant: "ghost", size: "icon" }), "size-10 text-ink lg:hidden")}
            aria-expanded={open}
            aria-controls="site-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen(!open)}
          >
            {open ? <X aria-hidden /> : <Menu aria-hidden />}
          </button>
        </div>
      </div>
      {/* The thin line under the bar: one pixel of navy at 15%, nearly the width of the page. */}
      <div aria-hidden className="mx-4 h-px bg-ink/15 sm:mx-6 lg:mx-8" />

      {open && (
        <nav
          id="site-menu"
          aria-label="Website"
          className="absolute inset-x-0 top-full max-h-[calc(100dvh-4.5rem)] overflow-y-auto border-b border-ink/15 bg-canvas shadow-[0_24px_48px_-28px_rgb(16_33_61/0.3)] lg:hidden"
        >
          <div className="mx-auto w-full max-w-[1440px] px-5 pt-2 pb-4 sm:px-8">
            <ul className="flex flex-col">
              {PLACES.map((place) => (
                <li key={place.href}>
                  <Link href={place.href} onClick={close} aria-current={current(place.href)} className={menuLinkStyles}>
                    {place.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link href={LOGIN_LINK.href} onClick={close} aria-current={current(LOGIN_LINK.href)} className={menuLinkStyles}>
                  {LOGIN_LINK.label}
                </Link>
              </li>
              <li>
                <Link href={DEMO_LINK.href} onClick={close} aria-current={current(DEMO_LINK.href)} className={menuLinkStyles}>
                  {DEMO_LINK.label}
                  <ArrowUpRight aria-hidden className="size-4" strokeWidth={2} />
                </Link>
              </li>
            </ul>
            <Link href={SIGNUP_LINK.href} onClick={close} className={buttonStyles({ size: "lg", className: "mt-3 w-full" })}>
              {SIGNUP_LINK.label}
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}
