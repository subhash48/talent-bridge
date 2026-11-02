"use client";

import { ArrowUpRight, ChevronDown, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

import { HirvelloLogo } from "@/components/shared/HirvelloLogo";
import { COMPANY_LINKS, EMPLOYER_PORTAL_LINK, HOW_IT_WORKS_LINK, PRICING_LINK, PRODUCT_LINK, SOLUTIONS } from "@/components/site/nav";
import { buttonStyles } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

// Frosted glass over the sky: a pale tint the gradient shows through, a bright hairline and the softest shadow.
const GLASS = "bg-glass ring-1 ring-[rgb(255_255_255/0.6)] shadow-[0_8px_30px_rgb(20_35_59/0.08)] backdrop-blur-[16px] backdrop-saturate-150";
// What opens under the pill (a menu, or the whole navigation on narrow screens): frosted, and opaque enough to read
// over whatever the page has there.
const PANEL = "animate-pop-in rounded-[22px] bg-overlay/95 p-1.5 shadow-raised ring-1 ring-ink/[0.06] backdrop-blur-xl";

const linkStyles =
  "inline-flex h-9 items-center rounded-full px-3 text-[13.5px] text-charcoal transition-colors duration-200 hover:bg-ink/[0.05] hover:text-ink aria-[current=page]:bg-ink/[0.05] aria-[current=page]:text-ink";
const menuLinkStyles =
  "block rounded-[14px] px-3.5 py-2.5 text-[15px] text-charcoal transition-colors hover:bg-ink/[0.05] hover:text-ink aria-[current=page]:bg-ink/[0.05] aria-[current=page]:text-ink";
const rowStyles = "flex items-center gap-3 rounded-[14px] px-3 py-2 transition-colors hover:bg-ink/[0.05] aria-[current=page]:bg-ink/[0.05]";

type Panel = "solutions" | "company" | "menu";

/** The three solutions as rows: an icon, who it's for and what it does for them. */
function SolutionRows({ pathname, onPick }: { pathname: string; onPick: () => void }) {
  return (
    <ul className="flex flex-col">
      {SOLUTIONS.map(({ href, label, text, icon: Icon }) => (
        <li key={href}>
          <Link href={href} onClick={onPick} aria-current={pathname === href ? "page" : undefined} className={rowStyles}>
            <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-accent-soft text-brand-ink">
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

/** About, Careers and Contact as rows of the Company menu. */
function CompanyRows({ pathname, onPick }: { pathname: string; onPick: () => void }) {
  return (
    <ul className="flex flex-col">
      {COMPANY_LINKS.map(({ href, label }) => (
        <li key={href}>
          <Link href={href} onClick={onPick} aria-current={pathname === href ? "page" : undefined} className={menuLinkStyles}>
            {label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * The public website's header: a small floating pill of glass over the page. Product, How it works, a Solutions
 * menu (who Hirvello is for), Pricing and a Company menu in the middle; Sign in and Employer portal on the right.
 * It is as wide as a comfortable page, never the screen. Under lg the places fold into one menu behind a button,
 * and the bar keeps the logo, Sign in and that button.
 */
export function SiteHeader() {
  const [open, setOpen] = useState<Panel | null>(null);
  const pathname = usePathname();
  const pill = useRef<HTMLDivElement>(null);
  const solutionsButton = useRef<HTMLButtonElement>(null);
  const companyButton = useRef<HTMLButtonElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const close = () => setOpen(null);
  const current = (href: string) => (pathname === href ? "page" : undefined);
  const inSolutions = SOLUTIONS.some((solution) => solution.href === pathname);
  const inCompany = COMPANY_LINKS.some((link) => link.href === pathname);

  // Escape closes what's open and gives focus back to its button; so does a click, or focus moving, outside the pill.
  useEffect(() => {
    if (!open) return;
    const button = open === "solutions" ? solutionsButton : open === "company" ? companyButton : menuButton;
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

  const panelLinks = () => [...(panel.current?.querySelectorAll<HTMLAnchorElement>("a") ?? [])];
  // Arrow keys, as in a menu: down on a closed button opens its menu on the first row; in the rows they move between
  // them, round the ends.
  function moveInMenu(which: "solutions" | "company", event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const links = open === which ? panelLinks() : [];
    if (!links.length) {
      setOpen(which);
      requestAnimationFrame(() => panelLinks()[0]?.focus());
      return;
    }
    const step = event.key === "ArrowDown" ? 1 : -1;
    const at = links.indexOf(document.activeElement as HTMLAnchorElement);
    links[at < 0 ? (step > 0 ? 0 : links.length - 1) : (at + step + links.length) % links.length]?.focus();
  }
  const onSolutionsKey = (event: ReactKeyboardEvent<HTMLDivElement>) => moveInMenu("solutions", event);
  const onCompanyKey = (event: ReactKeyboardEvent<HTMLDivElement>) => moveInMenu("company", event);

  const disclosure = (which: "solutions" | "company", label: string, active: boolean) => (
    <button
      ref={which === "solutions" ? solutionsButton : companyButton}
      type="button"
      aria-expanded={open === which}
      aria-controls={`site-${which}`}
      onClick={() => setOpen(open === which ? null : which)}
      className={cn(linkStyles, "gap-1 pr-2", (active || open === which) && "bg-ink/[0.05] text-ink")}
    >
      {label}
      <ChevronDown aria-hidden className={cn("size-3.5 transition-transform duration-200", open === which && "rotate-180")} />
    </button>
  );

  return (
    <header className="fixed inset-x-0 top-0 z-40 px-3 pt-3 sm:px-5 lg:pt-5">
      <div
        ref={pill}
        className={cn(
          "relative mx-auto flex h-13 w-full max-w-[1120px] items-center justify-between rounded-full pr-1.5 pl-4 lg:grid lg:h-14 lg:grid-cols-[1fr_auto_1fr] lg:px-2.5",
          GLASS,
        )}
      >
        <Link href="/" className="justify-self-start rounded-full py-1 lg:ml-2.5" aria-label="Hirvello home">
          <HirvelloLogo />
        </Link>

        <nav aria-label="Website" className="hidden items-center gap-0.5 lg:flex">
          <Link href={PRODUCT_LINK.href} aria-current={current(PRODUCT_LINK.href)} className={linkStyles}>
            {PRODUCT_LINK.label}
          </Link>
          <Link href={HOW_IT_WORKS_LINK.href} className={linkStyles}>
            {HOW_IT_WORKS_LINK.label}
          </Link>
          <div className="relative" onKeyDown={onSolutionsKey}>
            {disclosure("solutions", "Solutions", inSolutions)}
            {open === "solutions" && (
              <div ref={panel} id="site-solutions" className={cn(PANEL, "absolute top-full left-1/2 mt-3 w-[304px] -translate-x-1/2")}>
                <SolutionRows pathname={pathname} onPick={close} />
              </div>
            )}
          </div>
          <Link href={PRICING_LINK.href} aria-current={current(PRICING_LINK.href)} className={linkStyles}>
            {PRICING_LINK.label}
          </Link>
          <div className="relative" onKeyDown={onCompanyKey}>
            {disclosure("company", "Company", inCompany)}
            {open === "company" && (
              <div ref={panel} id="site-company" className={cn(PANEL, "absolute top-full left-1/2 mt-3 w-[200px] -translate-x-1/2")}>
                <CompanyRows pathname={pathname} onPick={close} />
              </div>
            )}
          </div>
        </nav>

        <div className="flex items-center gap-1 lg:col-start-3 lg:justify-self-end lg:gap-1.5">
          <Link href="/signin" aria-current={current("/signin")} className={cn(linkStyles, "hidden sm:inline-flex")}>
            Sign in
          </Link>
          <Link
            href={EMPLOYER_PORTAL_LINK.href}
            className={buttonStyles({ variant: "glass", size: "md", className: "hidden h-10 gap-1.5 px-4 text-[13.5px] md:inline-flex" })}
          >
            {EMPLOYER_PORTAL_LINK.label}
            <ArrowUpRight aria-hidden className="size-4 text-stone" />
          </Link>
          <button
            ref={menuButton}
            type="button"
            className={cn(buttonStyles({ variant: "ghost", size: "icon" }), "text-ink lg:hidden")}
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
              {[PRODUCT_LINK, HOW_IT_WORKS_LINK, PRICING_LINK].map((link) => (
                <li key={link.href}>
                  <Link href={link.href} onClick={close} aria-current={current(link.href)} className={menuLinkStyles}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-1 border-t border-ink/[0.06] px-3.5 pt-3 pb-1 text-[11px] font-semibold tracking-[0.16em] text-stone uppercase">
              Solutions
            </p>
            <SolutionRows pathname={pathname} onPick={close} />
            <p className="mt-1 border-t border-ink/[0.06] px-3.5 pt-3 pb-1 text-[11px] font-semibold tracking-[0.16em] text-stone uppercase">
              Company
            </p>
            <CompanyRows pathname={pathname} onPick={close} />
            <div className="flex flex-col gap-2 border-t border-ink/[0.06] p-2 pt-3">
              <Link href={EMPLOYER_PORTAL_LINK.href} onClick={close} className={buttonStyles({ size: "lg", className: "w-full" })}>
                {EMPLOYER_PORTAL_LINK.label}
                <ArrowUpRight aria-hidden />
              </Link>
              <Link href="/signin" onClick={close} className={buttonStyles({ variant: "secondary", size: "lg", className: "w-full" })}>
                Sign in
              </Link>
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}
