"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { HirvelloLogo } from "@/components/shared/HirvelloLogo";
import { HOME_LINK, HOW_IT_WORKS_LINK, LOGIN_LINK, PRICING_LINK, PRODUCT_LINK, SIGNUP_LINK } from "@/components/site/nav";
import { buttonStyles } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

/** The places in the bar, in order. The solutions and the company pages are in the footer. */
const PLACES = [HOME_LINK, PRODUCT_LINK, HOW_IT_WORKS_LINK, PRICING_LINK] as const;

// The bar: a white pill floating over the sky, with a hairline edge and a soft shadow under it.
const BAR = "bg-white/[0.92] ring-1 ring-ink/[0.06] shadow-[0_1px_2px_rgb(16_33_61/0.04),0_10px_30px_-10px_rgb(16_33_61/0.16)] backdrop-blur-xl backdrop-saturate-150";
// The navigation when it folds under the bar on narrow screens: white, and opaque enough that the page's headline
// doesn't ghost through it.
const PANEL = "animate-pop-in rounded-[20px] bg-white/[0.98] p-2 shadow-raised ring-1 ring-ink/[0.07] backdrop-blur-xl";

// Navy text, a faint navy pill behind the place you're on, and under the pointer.
const linkStyles =
  "inline-flex h-10 items-center rounded-full px-3.5 text-[15px] font-medium text-ink transition-colors duration-200 hover:bg-ink/[0.05] aria-[current=page]:bg-ink/[0.05]";
const menuLinkStyles =
  "block rounded-[12px] px-3.5 py-2.5 text-[15px] font-medium text-ink transition-colors hover:bg-ink/[0.05] aria-[current=page]:bg-ink/[0.05]";

/**
 * The public website's header: a white pill floating over the page. The logo on the left; Home, Product, How it
 * works and Pricing in the middle, in navy; Log in as plain text and Sign up as a blue button on the right. It is
 * as wide as the page's content, never the screen. Under lg the places fold into one menu behind a button, and the
 * bar keeps the logo, Sign up and that button.
 */
export function SiteHeader() {
  const pathname = usePathname();
  // The menu remembers the page it was opened on, so leaving that page by any means closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const setOpen = (value: boolean) => setOpenOn(value ? pathname : null);
  const bar = useRef<HTMLDivElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const close = () => setOpen(false);
  const current = (href: string) => (pathname === href ? "page" : undefined);

  // Escape closes the menu and gives focus back to its button; so does a click, or focus moving, outside the bar.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpenOn(null);
      menuButton.current?.focus();
    };
    const outside = (event: Event) => {
      if (event.target instanceof Node && !bar.current?.contains(event.target)) setOpenOn(null);
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
    <header className="fixed inset-x-0 top-0 z-40 px-3 pt-3 sm:px-5 lg:pt-4">
      {/* The folded menu is a sibling of the bar, not a child: inside the bar's backdrop blur, Chrome lets the page's
          headline ghost through the translucent panel. */}
      <div ref={bar} className="relative mx-auto w-full max-w-[1200px]">
        <div
          className={cn(
            "flex h-[60px] items-center justify-between rounded-full pr-2 pl-4 sm:h-[68px] sm:pr-2.5 sm:pl-5 lg:grid lg:grid-cols-[1fr_auto_1fr]",
            BAR,
          )}
        >
          <Link href="/" className="justify-self-start rounded-full py-1" aria-label="Hirvello home">
            <HirvelloLogo />
          </Link>

          <nav aria-label="Website" className="hidden items-center gap-1 lg:flex">
            {PLACES.map((place) => (
              <Link key={place.href} href={place.href} aria-current={current(place.href)} className={linkStyles}>
                {place.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-1 lg:col-start-3 lg:justify-self-end lg:gap-2">
            <Link
              href={LOGIN_LINK.href}
              aria-current={current(LOGIN_LINK.href)}
              className="hidden h-10 items-center rounded-full px-3.5 text-[15px] font-medium text-ink transition-colors duration-200 hover:text-brand-ink sm:inline-flex"
            >
              {LOGIN_LINK.label}
            </Link>
            <Link href={SIGNUP_LINK.href} className={buttonStyles({ size: "md", className: "h-10 px-5 text-[14.5px]" })}>
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

        {open && (
          <nav
            id="site-menu"
            aria-label="Website"
            className={cn(PANEL, "absolute inset-x-0 top-full mt-2 max-h-[calc(100dvh-5.5rem)] overflow-y-auto lg:hidden")}
          >
            <ul className="flex flex-col">
              {PLACES.map((place) => (
                <li key={place.href}>
                  <Link href={place.href} onClick={close} aria-current={current(place.href)} className={menuLinkStyles}>
                    {place.label}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex flex-col gap-2 border-t border-ink/[0.06] px-1 pt-3 pb-1">
              <Link href={SIGNUP_LINK.href} onClick={close} className={buttonStyles({ size: "lg", className: "w-full" })}>
                {SIGNUP_LINK.label}
              </Link>
              <Link href={LOGIN_LINK.href} onClick={close} className={buttonStyles({ variant: "secondary", size: "lg", className: "w-full" })}>
                {LOGIN_LINK.label}
              </Link>
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}
