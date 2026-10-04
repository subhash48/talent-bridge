import type { ReactNode } from "react";

import { NightSky } from "@/components/auth/NightSky";
import { EncordMark } from "@/components/shared/EncordLogo";
import { cn } from "@/lib/utils";

// The sign-in page's own palette: ink black (#031211) and warm ivory (#e8e4d3), with muted ivory for
// secondary text and borders. It redefines the theme's colour tokens for this page only, so the shared
// field, button and alert styles inside it follow without changing anywhere else.
const PALETTE = [
  "[--color-canvas:#031211]",
  "[--color-ink:#e8e4d3]",
  "[--color-charcoal:rgb(232_228_211/0.85)]",
  "[--color-stone:rgb(232_228_211/0.7)]",
  "[--color-faint:rgb(232_228_211/0.55)]",
  "[--color-border:rgb(232_228_211/0.14)]",
  "[--color-border-strong:rgb(232_228_211/0.28)]",
  // Notices ("Your session has ended") are ivory here, not violet.
  "[--color-ai:#e8e4d3]",
  "[--color-violet-100:#e8e4d3]",
].join(" ");

type LoginCardProps = {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
};

/** The sign-in page: one card, centred on a night sky, holding the brand, the title, the form and a footer. */
export function LoginCard({ title, description, children, footer }: LoginCardProps) {
  return (
    <main className={cn(PALETTE, "relative isolate flex min-h-dvh flex-col items-center justify-center bg-canvas px-4 py-10 text-charcoal")}>
      <NightSky />
      <div className="w-full max-w-[460px] rounded-[24px] border border-ink/25 bg-canvas bg-linear-to-b from-ink/[0.045] to-ink/[0.02] px-6 pt-8 pb-7 sm:px-10">
        <div className="flex flex-col items-center text-center">
          <span className="inline-flex items-center gap-3 text-ink">
            <EncordMark className="h-[30px] w-auto" />
            <span className="text-xl font-bold tracking-[0.08em]">ENCORD</span>
          </span>
          {/* Padded on the left by its letter spacing, which otherwise pulls the label off centre. */}
          <p className="mt-3 pl-[0.34em] text-[13px] tracking-[0.34em] text-stone uppercase">Talent Bridge</p>
          <h1 className="mt-2 text-[32px] leading-tight font-bold tracking-tight text-ink sm:text-[38px]">{title}</h1>
          {description && <p className="mt-1 text-[15px] leading-relaxed text-stone">{description}</p>}
        </div>
        <div className="mt-5">{children}</div>
        {footer && <div className="mt-5 border-t border-border pt-5 text-center">{footer}</div>}
      </div>
    </main>
  );
}
