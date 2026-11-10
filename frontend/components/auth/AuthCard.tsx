import Link from "next/link";
import type { ReactNode } from "react";

import { HirvelloLogo, HirvelloMark } from "@/components/shared/HirvelloLogo";
import { cn } from "@/lib/utils";

type AuthCardProps = {
  title: string;
  /** A small label above the title saying whose page this is, e.g. "Candidate portal". */
  eyebrow?: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Wider for longer forms, like setting up a workspace. */
  wide?: boolean;
};

/** The labels for the two kinds of account, used as the eyebrow on their pages. */
export const AUDIENCE_EYEBROW = { candidate: "Candidate portal", employer: "Employer workspace" } as const;

/**
 * The frame every sign-in, sign-up and activation page shares. On wide screens: the Hirvello panel on the left,
 * the brand's blue deepening to navy, and the form on the sky on the right, in a sheet of glass. On phones the
 * panel steps aside and the form keeps the whole screen, under the logo. There's no navigation here: the card's
 * footer holds the one or two links that lead elsewhere.
 */
export function AuthCard({ title, eyebrow, description, children, footer, wide }: AuthCardProps) {
  return (
    <div className="sky-backdrop flex min-h-dvh">
      <aside className="brand-backdrop relative hidden w-[42%] max-w-[600px] shrink-0 flex-col justify-between overflow-hidden p-10 lg:flex xl:p-14">
        <HirvelloMark tone="dark" aria-hidden className="pointer-events-none absolute -right-20 -bottom-20 h-[440px] opacity-[0.12]" />
        <Link href="/" aria-label="Hirvello home" className="relative w-fit rounded-md">
          <HirvelloLogo tone="dark" />
        </Link>
        <div className="relative max-w-md">
          <p className="flex items-center gap-2 text-[12px] font-semibold tracking-[0.18em] text-on-brand/80 uppercase">
            <span aria-hidden className="size-1.5 rounded-full bg-sky" />
            Less noise. More signal.
          </p>
          <p className="mt-4 text-[clamp(26px,2.3vw,36px)] leading-[1.12] font-bold tracking-[-0.025em] text-on-brand">
            Hiring shouldn&apos;t feel like a <span className="text-sky">black box.</span>
          </p>
          <p className="mt-4 text-[16px] leading-relaxed text-on-brand/85">
            Hirvello finds the real candidates and keeps recruiters and candidates informed throughout hiring.
          </p>
        </div>
        <p className="relative text-[13px] text-on-brand/75">© 2026 Hirvello</p>
      </aside>

      <main className="flex flex-1 flex-col px-4 py-5 sm:px-10 sm:py-7">
        <Link href="/" aria-label="Hirvello home" className="w-fit rounded-md lg:hidden">
          <HirvelloLogo />
        </Link>
        <div className={cn("mx-auto flex w-full flex-1 flex-col justify-center py-6 sm:py-10", wide ? "max-w-[600px]" : "max-w-[440px]")}>
          <div className="sky-card rounded-[22px] px-5 py-7 sm:px-9 sm:py-9">
            {eyebrow && (
              <p className="mb-2.5 text-[12px] leading-none font-semibold tracking-[0.14em] text-brand-ink uppercase">{eyebrow}</p>
            )}
            <h1 className="text-[clamp(24px,2.1vw,30px)] leading-[1.15] font-bold tracking-[-0.025em] text-ink">{title}</h1>
            {description && <div className="mt-2 text-[15px] leading-relaxed text-charcoal">{description}</div>}
            <div className="mt-7 [&_input:not([type=checkbox]):not([type=radio])]:h-11 [&_button[type=submit]]:h-11 [&_button[type=submit]]:text-[15px]">
              {children}
            </div>
            {footer && (
              <div className="mt-7 flex flex-col gap-2 border-t border-ink/[0.07] pt-5 text-[14px] leading-relaxed text-stone">{footer}</div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

/** A quiet link on these pages, e.g. "Forgot password?". */
export const authLinkStyles = "font-medium text-brand-ink underline-offset-4 transition-colors hover:text-ink hover:underline";
