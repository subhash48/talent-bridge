import Link from "next/link";
import type { ReactNode } from "react";

import { HirvelloLogo, HirvelloMark } from "@/components/shared/HirvelloLogo";
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
 * The frame every sign-in, sign-up and activation page shares. On wide screens: the Hirvello panel on the left,
 * the brand's blue deepening to navy, and the form on the sky on the right, in a sheet of glass. On phones the
 * panel steps aside and the form keeps the whole screen, under the logo.
 */
export function AuthCard({ title, description, children, footer, wide }: AuthCardProps) {
  return (
    <div className="sky-backdrop flex min-h-dvh">
      <aside className="brand-backdrop relative hidden w-[44%] max-w-[640px] shrink-0 flex-col justify-between overflow-hidden p-12 lg:flex xl:p-16">
        <HirvelloMark tone="dark" aria-hidden className="pointer-events-none absolute -right-24 -bottom-24 h-[520px] opacity-[0.12]" />
        <Link href="/" aria-label="Hirvello home" className="relative w-fit rounded-md">
          <HirvelloLogo tone="dark" />
        </Link>
        <div className="relative max-w-md">
          <p className="flex items-center gap-2 text-[11.5px] font-medium tracking-[0.22em] text-on-brand/80 uppercase">
            <span aria-hidden className="size-1.5 rounded-full bg-sky" />
            Less noise. More signal.
          </p>
          <p className="mt-5 text-[clamp(30px,2.8vw,44px)] leading-[1.04] font-medium tracking-[-0.04em] text-on-brand">
            Hiring shouldn&apos;t feel like a <em className="font-serif font-normal text-sky italic">black box.</em>
          </p>
          <p className="mt-5 text-[16px] leading-relaxed text-on-brand/85">
            Hirvello finds the real candidates and keeps recruiters and candidates informed throughout hiring.
          </p>
        </div>
        <p className="relative text-[13px] text-on-brand/75">© 2026 Hirvello</p>
      </aside>

      <main className="flex flex-1 flex-col px-5 py-6 sm:px-10 sm:py-8">
        <Link href="/" aria-label="Hirvello home" className="w-fit rounded-md lg:hidden">
          <HirvelloLogo />
        </Link>
        <div className={cn("mx-auto flex w-full flex-1 flex-col justify-center py-8", wide ? "max-w-[600px]" : "max-w-[460px]")}>
          <div className="sky-card rounded-[28px] px-6 py-8 sm:px-9 sm:py-10">
            <h1 className="text-[clamp(26px,3vw,34px)] leading-[1.1] font-medium tracking-[-0.035em] text-ink">{title}</h1>
            {description && <div className="mt-3 text-[15px] leading-relaxed text-charcoal">{description}</div>}
            <div className="mt-8 [&_input:not([type=checkbox]):not([type=radio])]:h-11 [&_button[type=submit]]:h-11 [&_button[type=submit]]:text-sm">{children}</div>
            {footer && <div className="mt-8 border-t border-ink/[0.07] pt-6 text-sm text-stone">{footer}</div>}
          </div>
        </div>
      </main>
    </div>
  );
}

/** A quiet link on these pages, e.g. "Forgot password?". */
export const authLinkStyles = "font-medium text-brand-ink underline-offset-4 transition-colors hover:text-ink hover:underline";
