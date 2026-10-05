import type { ReactNode } from "react";

import { EncordLogo } from "@/components/shared/EncordLogo";
import { NightSky } from "@/components/shared/NightSky";
import { Card } from "@/components/ui/Card";

type AuthCardProps = {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
};

/** The frame every sign-in page shares: the brand, a title and one compact card. */
export function AuthCard({ title, description, children, footer }: AuthCardProps) {
  return (
    <main className="relative isolate flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <NightSky />
      <Card className="w-full max-w-sm p-8">
        <EncordLogo />
        <p className="mt-8 text-xs font-medium tracking-wide text-stone">Talent Bridge</p>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1.5 text-sm leading-relaxed text-stone">{description}</p>}
        <div className="mt-7">{children}</div>
      </Card>
      {footer && <div className="mt-6 text-center text-sm text-stone">{footer}</div>}
    </main>
  );
}

/** A quiet in-card link, e.g. "Forgot password?". */
export const authLinkStyles = "font-medium text-charcoal underline-offset-4 transition-colors hover:text-ink hover:underline";
