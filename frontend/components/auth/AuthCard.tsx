import Link from "next/link";
import type { ReactNode } from "react";

import { KavuntraLogo, KavuntraMark } from "@/components/shared/KavuntraLogo";
import { cn } from "@/lib/utils";

type AuthCardProps = {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Wider for longer forms, like setting up a workspace. */
  wide?: boolean;
};

/**
 * The frame every sign-in, sign-up and activation page shares. On wide screens: the Kavuntra panel on the
 * left, deep teal like the mark's own backdrop, and the form on the website's sky on the right. On phones the
 * panel steps aside and the form keeps the whole screen, under the logo. No card: the page is the surface.
 */
export function AuthCard({ title, description, children, footer, wide }: AuthCardProps) {
  return (
    <div className="sky-backdrop flex min-h-dvh">
      <aside className="brand-backdrop relative hidden w-[44%] max-w-[640px] shrink-0 flex-col justify-between overflow-hidden p-12 lg:flex xl:p-16">
        <KavuntraMark tone="dark" aria-hidden className="pointer-events-none absolute -right-24 -bottom-16 h-[520px] opacity-[0.07]" />
        <Link href="/" aria-label="Kavuntra home" className="relative w-fit rounded-md">
          <KavuntraLogo tone="dark" />
        </Link>
        <div className="relative max-w-md">
          <p className="text-[clamp(30px,2.8vw,42px)] leading-[1.08] font-semibold tracking-[-0.035em] text-on-brand">
            Hiring shouldn&apos;t feel like a black box.
          </p>
          <p className="mt-5 text-[16px] leading-relaxed text-on-brand/85">
            Kavuntra keeps recruiters responsive and candidates informed throughout the hiring process.
          </p>
        </div>
        <p className="relative text-[13px] text-on-brand/80">© 2026 Kavuntra</p>
      </aside>

      <main className="flex flex-1 flex-col px-5 py-8 sm:px-10">
        <Link href="/" aria-label="Kavuntra home" className="w-fit rounded-md lg:hidden">
          <KavuntraLogo />
        </Link>
        <div className={cn("mx-auto flex w-full flex-1 flex-col justify-center py-10", wide ? "max-w-[560px]" : "max-w-[400px]")}>
          <h1 className="text-[clamp(28px,3.2vw,36px)] leading-[1.1] font-semibold tracking-[-0.035em] text-ink">{title}</h1>
          {description && <div className="mt-3 text-[15px] leading-relaxed text-stone">{description}</div>}
          <div className="mt-9 [&_input:not([type=checkbox]):not([type=radio])]:h-11 [&_button[type=submit]]:h-11 [&_button[type=submit]]:text-sm">{children}</div>
          {footer && <div className="mt-9 border-t border-border pt-6 text-sm text-stone">{footer}</div>}
        </div>
      </main>
    </div>
  );
}

/** A quiet link on these pages, e.g. "Forgot password?". */
export const authLinkStyles = "font-medium text-brand-ink underline-offset-4 transition-colors hover:text-ink hover:underline";
