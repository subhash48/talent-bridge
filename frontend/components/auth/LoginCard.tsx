import type { ReactNode } from "react";

import { EncordMark } from "@/components/shared/EncordLogo";
import { NightSky } from "@/components/shared/NightSky";

type LoginCardProps = {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
};

/** The sign-in page: one card, centred on a night sky, holding the brand, the title, the form and a footer. */
export function LoginCard({ title, description, children, footer }: LoginCardProps) {
  return (
    <main className="relative isolate flex min-h-dvh flex-col items-center justify-center bg-canvas px-4 py-10 text-charcoal">
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
        {footer && <div className="mt-5 border-t border-ink/[0.14] pt-5 text-center">{footer}</div>}
      </div>
    </main>
  );
}
