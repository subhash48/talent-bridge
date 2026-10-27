"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { COMPANY_LINKS, PRODUCT_LINK } from "@/components/site/nav";
import { KavuntraLogo } from "@/components/shared/KavuntraLogo";
import { buttonStyles } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

// Light glass over the landscape: a warm stone tint the sky shows through, a hairline edge and the softest shadow.
const GLASS =
  "bg-[rgb(237_241_232/0.58)] ring-1 ring-[rgb(250_248_242/0.5)] shadow-[0_6px_24px_rgb(20_44_42/0.08)] backdrop-blur-[10px] backdrop-saturate-150";
// What opens under the pill (the whole menu on narrow screens): frosted, and opaque enough to read over whatever
// the page has there.
const PANEL = "animate-pop-in rounded-[20px] bg-[rgb(246_243_236/0.95)] p-1.5 shadow-raised ring-1 ring-ink/[0.07] backdrop-blur-xl";

const linkStyles =
  "inline-flex h-8 items-center rounded-full px-2.5 text-[13.5px] text-charcoal transition-colors duration-200 hover:bg-ink/[0.06] hover:text-ink aria-[current=page]:bg-ink/[0.06] aria-[current=page]:text-ink";
const menuLinkStyles =
  "block rounded-[14px] px-3.5 py-2.5 text-[15px] text-charcoal transition-colors hover:bg-ink/[0.06] hover:text-ink aria-[current=page]:bg-ink/[0.06] aria-[current=page]:text-ink";

type Panel = "menu";

/**
 * The public website's header: a small floating pill over the page. Product, About, Careers and Contact in the
 * middle; Sign in and Get started on the right. It is as wide as a comfortable page, never the screen. Under lg
 * the places fold into one menu behind a button.
 */
export function SiteHeader() {
  const [open, setOpen] = useState<Panel | null>(null);
  const pathname = usePathname();
  const pill = useRef<HTMLDivElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const close = () => setOpen(null);
  const current = (href: string) => (pathname === href ? "page" : undefined);

  // Escape closes what's open and gives focus back to its button; so does a click anywhere outside the pill.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(null);
      menuButton.current?.focus();
    };
    const outside = (event: Event) => {
      if (event.target instanceof Node && !pill.current?.contains(event.target)) setOpen(null);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", outside);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", outside);
    };
  }, [open]);

  return (
    <header className="fixed inset-x-0 top-0 z-40 px-3 pt-3 sm:px-5 lg:pt-5">
      <div
        ref={pill}
        className={cn(
          "relative mx-auto flex h-12 w-full max-w-[1040px] items-center justify-between rounded-full pr-1.5 pl-4 lg:grid lg:h-14 lg:grid-cols-[1fr_auto_1fr] lg:px-2.5",
          GLASS,
        )}
      >
        <Link href="/" className="justify-self-start rounded-full py-1 lg:ml-2.5" aria-label="Kavuntra home">
          <KavuntraLogo />
        </Link>

        <nav aria-label="Website" className="hidden items-center gap-0.5 lg:flex">
          <Link href={PRODUCT_LINK.href} aria-current={current(PRODUCT_LINK.href)} className={linkStyles}>
            {PRODUCT_LINK.label}
          </Link>
          {COMPANY_LINKS.map((link) => (
            <Link key={link.href} href={link.href} aria-current={current(link.href)} className={linkStyles}>
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1 lg:col-start-3 lg:justify-self-end lg:gap-1.5">
          <Link href="/signin" aria-current={current("/signin")} className={linkStyles}>
            Sign in
          </Link>
          <Link
            href="/start"
            className={buttonStyles({ size: "md", className: "h-9 rounded-full px-[18px] text-[13.5px]" })}
          >
            Get started
          </Link>
          <button
            ref={menuButton}
            type="button"
            className={cn(buttonStyles({ variant: "ghost", size: "icon" }), "rounded-full text-ink lg:hidden")}
            aria-expanded={open === "menu"}
            aria-controls="site-menu"
            aria-label={open === "menu" ? "Close menu" : "Open menu"}
            onClick={() => setOpen(open === "menu" ? null : "menu")}
          >
            {open === "menu" ? <X aria-hidden /> : <Menu aria-hidden />}
          </button>
        </div>

        {open === "menu" && (
          <nav
            id="site-menu"
            aria-label="Website"
            className={cn(PANEL, "absolute inset-x-0 top-full mt-2 max-h-[calc(100dvh-5rem)] overflow-y-auto lg:hidden")}
          >
            <ul className="flex flex-col">
              {[PRODUCT_LINK, ...COMPANY_LINKS].map((link) => (
                <li key={link.href}>
                  <Link href={link.href} onClick={close} aria-current={current(link.href)} className={menuLinkStyles}>
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
