"use client";

import { ArrowUpRight, Menu, Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { HirvelloLogo } from "@/components/shared/HirvelloLogo";
import {
  DEMO_LINK,
  NEW_TAB,
  NEW_TAB_NOTE,
  HOME_LINK,
  HOW_IT_WORKS_LINK,
  JOBS_LINK,
  LOGIN_LINK,
  PRICING_LINK,
  PRODUCT_LINK,
  SIGNUP_LINK,
} from "@/components/site/nav";
import { buttonStyles } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

/** The places in the bar, in order. Find Jobs comes straight after Home; the solutions and company pages are in the footer. */
const PLACES = [HOME_LINK, JOBS_LINK, PRODUCT_LINK, HOW_IT_WORKS_LINK, PRICING_LINK] as const;

// Navy text at 16px with nothing behind it; the place you're on is a shade heavier (aria-current is "page" on the
// page itself and "true" inside its section, such as a job under Find Jobs), and blue under the pointer.
const linkStyles =
  "inline-flex h-10 items-center gap-1 rounded-md text-[16px] font-medium whitespace-nowrap text-ink transition-colors duration-200 hover:text-brand-ink [&[aria-current]]:font-semibold";
const menuLinkStyles =
  "flex h-12 items-center gap-1.5 rounded-[10px] px-3 text-[16px] font-medium text-ink transition-colors hover:bg-ink/[0.04] [&[aria-current]]:font-semibold";

/** A place's words, with a small blue magnifier in front of Find Jobs so the way to the jobs stands out a little. */
function PlaceLabel({ place }: { place: (typeof PLACES)[number] }) {
  if (place.href !== JOBS_LINK.href) return place.label;
  return (
    <>
      <Search aria-hidden className="size-[15px] text-brand-ink" strokeWidth={2.25} />
      {place.label}
    </>
  );
}

// Whether the page has scrolled under the bar. Read as an external store, so the first render on the server and in
// the browser agree (not scrolled) and no state is set from an effect.
const subscribeToScroll = (onChange: () => void) => {
  window.addEventListener("scroll", onChange, { passive: true });
  return () => window.removeEventListener("scroll", onChange);
};
const isScrolled = () => window.scrollY > 8;
const isScrolledOnServer = () => false;

/**
 * The public website's header: the logo on the left, Home, Find Jobs, Product, How it works and Pricing in the
 * middle, then Sign in, Book a demo and Create account on the right, all straight on the sky with one thin line under
 * them. No box, no shadow: the bar is clear at the top of the page and takes a little of the mist once the page
 * scrolls under it, so the words stay readable. Under lg the places fold into one menu behind a button, and the bar
 * keeps the logo, Create account and that button. Between lg and xl the spacing tightens so nothing wraps or touches.
 */
export function SiteHeader() {
  const pathname = usePathname();
  // The menu remembers the page it was opened on, so leaving that page by any means closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const setOpen = (value: boolean) => setOpenOn(value ? pathname : null);
  const scrolled = useSyncExternalStore(subscribeToScroll, isScrolled, isScrolledOnServer);
  const header = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const close = () => setOpen(false);
  // The page you're on, or (for the job board) the section: a job's details and its apply page sit under Find Jobs.
  const current = (href: string) => {
    if (pathname === href) return "page";
    if (href === JOBS_LINK.href && pathname.startsWith(`${JOBS_LINK.href}/`)) return "true";
    return undefined;
  };

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
      className={cn(
        "fixed inset-x-0 top-0 z-40 transition-[background-color] duration-200",
        // Open: solid, with no blur, because a blur inside a blur shows the page through the menu in Chrome.
        open ? "bg-canvas" : scrolled && "bg-canvas/85 backdrop-blur-xl",
      )}
    >
      {/* Up to 1440px the three groups share the width evenly (justify-between, so the gaps either side of the places
          match); from 1440px there's room to centre the places on the page. A centred grid any narrower leaves the
          right-hand group no room, and Pricing ends up touching Sign in. */}
      <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center justify-between gap-4 px-5 sm:px-8 lg:h-20 xl:px-10 min-[1440px]:grid min-[1440px]:grid-cols-[1fr_auto_1fr] min-[1440px]:gap-8">
        <Link href="/" className="justify-self-start rounded-md" aria-label="Hirvello home">
          <HirvelloLogo />
        </Link>

        <nav aria-label="Website" className="hidden items-center gap-5 lg:flex xl:gap-7 min-[1440px]:gap-9">
          {PLACES.map((place) => (
            <Link key={place.href} href={place.href} aria-current={current(place.href)} className={linkStyles}>
              <PlaceLabel place={place} />
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2 lg:gap-4 xl:gap-6 min-[1440px]:col-start-3 min-[1440px]:justify-self-end min-[1440px]:gap-7">
          <Link href={LOGIN_LINK.href} aria-current={current(LOGIN_LINK.href)} className={cn(linkStyles, "hidden lg:inline-flex")}>
            {LOGIN_LINK.label}
          </Link>
          <a href={DEMO_LINK.href} {...NEW_TAB} className={cn(linkStyles, "hidden lg:inline-flex")}>
            {DEMO_LINK.label}
            <span className="sr-only">{NEW_TAB_NOTE}</span>
            <ArrowUpRight aria-hidden className="size-4" strokeWidth={2} />
          </a>
          {/* Below 360px the logo, this and the menu button don't fit on one line; the menu has it full width. */}
          <Link href={SIGNUP_LINK.href} className={buttonStyles({ size: "lg", className: "px-5 max-[359px]:hidden" })}>
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
                    <PlaceLabel place={place} />
                  </Link>
                </li>
              ))}
              <li>
                <Link href={LOGIN_LINK.href} onClick={close} aria-current={current(LOGIN_LINK.href)} className={menuLinkStyles}>
                  {LOGIN_LINK.label}
                </Link>
              </li>
              <li>
                <a href={DEMO_LINK.href} {...NEW_TAB} onClick={close} className={menuLinkStyles}>
                  {DEMO_LINK.label}
                  <span className="sr-only">{NEW_TAB_NOTE}</span>
                  <ArrowUpRight aria-hidden className="size-4" strokeWidth={2} />
                </a>
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
