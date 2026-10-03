import type { ReactNode } from "react";

type CandidateHeaderProps = {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
};

/** Page header for the portal's inner pages. The dashboard has its own greeting. */
export function CandidateHeader({ title, subtitle, actions }: CandidateHeaderProps) {
  return (
    <header className="flex flex-col gap-4 pt-2 pb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-[32px] leading-tight font-semibold tracking-[-0.03em] text-ink sm:text-[38px]">{title}</h1>
        {subtitle && <p className="mt-2 text-[15px] text-stone">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
