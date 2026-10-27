"use client";

import { ChevronDown, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

import { COMPANY_LINKS, PRODUCT_LINK, SOLUTIONS } from "@/components/site/nav";
import { KavuntraLogo } from "@/components/shared/KavuntraLogo";
import { buttonStyles } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

// Light glass over the landscape: a warm stone tint the sky shows through, a hairline edge and the softest shadow.
const GLASS =
  "bg-[rgb(237_241_232/0.58)] ring-1 ring-[rgb(250_248_242/0.5)] shadow-[0_6px_24px_rgb(20_44_42/0.08)] backdrop-blur-[10px] backdrop-saturate-150";
// What opens under the pill (the Solutions menu, and the whole menu on narrow screens): frosted, and opaque enough
// to read over whatever the page has there.
const PANEL = "animate-pop-in rounded-[20px] bg-[rgb(246_243_236/0.95)] p-1.5 shadow-raised ring-1 ring-ink/[0.07] backdrop-blur-xl";

const linkStyles =
  "inline-flex h-8 items-center rounded-full px-2.5 text-[13.5px] text-charcoal transition-colors duration-200 hover:bg-ink/[0.06] hover:text-ink aria-[current=page]:bg-ink/[0.06] aria-[current=page]:text-ink";
const menuLinkStyles =
  "block rounded-[14px] px-3.5 py-2.5 text-[15px] text-charcoal transition-colors hover:bg-ink/[0.06] hover:text-ink aria-[current=page]:bg-ink/[0.06] aria-[current=page]:text-ink";
const rowStyles = "flex items-center gap-3 rounded-[14px] px-3 py-2 transition-colors hover:bg-ink/[0.06] aria-[current=page]:bg-ink/[0.06]";

type Panel = "solutions" | "menu";

/** The three solutions as rows: an icon, who it's for and what it does for them. */
function SolutionRows({ pathname, onPick }: { pathname: string; onPick: () => void }) {
  return (
    <ul className="flex flex-col">
      {SOLUTIONS.map(({ href, label, text, icon: Icon }) => (
        <li key={href}>
          <Link href={href} onClick={onPick} aria-current={pathname === href ? "page" : undefined} className={rowStyles}>
            <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-accent-soft/80 text-brand-ink">
              <Icon aria-hidden className="size-4" strokeWidth={1.75} />
            </span>
            <span className="min-w-0">
              <span className="block text-[14px] font-medium text-ink">{label}</span>
              <span className="mt-0.5 block text-[12.5px] leading-snug text-stone">{text}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * The public website's header: a small floating pill over the page. Product, About, Careers and Contact in the
 * middle; Sign in and Get started on the right. It is as wide as a comfortable page, never the screen. Under lg
 * the places fold into one menu behind a button.
 */
export function SiteHeader() {
  const [open, setOpen] = useState<Panel | null>(null);
  const pathname = usePathname();
  const pill = useRef<HTMLDivElement>(null);
  const solutionsButton = useRef<HTMLButtonElement>(null);
  const solutions = useRef<HTMLDivElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const close = () => setOpen(null);
  const current = (href: string) => (pathname === href ? "page" : undefined);

  // Escape closes what's open and gives focus back to its button; so does a click, or focus moving, outside the pill.
  useEffect(() => {
    if (!open) return;
    const button = open === "solutions" ? solutionsButton : menuButton;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(null);
      button.current?.focus();
    };
    const outside = (event: Event) => {
      if (event.target instanceof Node && !pill.current?.contains(event.target)) setOpen(null);
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

  const solutionLinks = () => [...(solutions.current?.querySelectorAll<HTMLAnchorElement>("a") ?? [])];
  // Arrow keys, as in a menu: down on the closed button opens Solutions on its first row; in the rows they move
  // between them, round the ends.
  const onSolutionsKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const links = solutionLinks();
    if (!links.length) {
      setOpen("solutions");
      requestAnimationFrame(() => solutionLinks()[0]?.focus());
      return;
    }
    const step = event.key === "ArrowDown" ? 1 : -1;
    const at = links.indexOf(document.activeElement as HTMLAnchorElement);
    links[at < 0 ? (step > 0 ? 0 : links.length - 1) : (at + step + links.length) % links.length]?.focus();
  };

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
          <div className="relative" onKeyDown={onSolutionsKey}>
            <button
              ref={solutionsButton}
              type="button"
              aria-expanded={open === "solutions"}
              aria-controls="site-solutions"
              onClick={() => setOpen(open === "solutions" ? null : "solutions")}
              className={cn(linkStyles, "gap-1 pr-2", open === "solutions" && "bg-ink/[0.06] text-ink")}
            >
              Solutions
              <ChevronDown
                aria-hidden
                className={cn("size-3.5 transition-transform duration-200", open === "solutions" && "rotate-180")}
              />
            </button>
            {open === "solutions" && (
              <div
                ref={solutions}
                id="site-solutions"
                className={cn(PANEL, "absolute top-full left-1/2 mt-3 w-[304px] -translate-x-1/2")}
              >
                <SolutionRows pathname={pathname} onPick={close} />
              </div>
            )}
          </div>
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
            className={buttonStyles({ size: "md", className: "hidden h-9 rounded-full px-[18px] text-[13.5px] lg:inline-flex" })}
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
            <p className="mt-1 border-t border-ink/[0.07] px-3.5 pt-3 pb-1 text-[11px] font-semibold tracking-[0.16em] text-stone uppercase">
              Solutions
            </p>
            <SolutionRows pathname={pathname} onPick={close} />
            <div className="border-t border-ink/[0.07] p-2 pt-3">
              <Link href="/start" onClick={close} className={buttonStyles({ size: "lg", className: "w-full rounded-full" })}>
                Get started
              </Link>
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}
