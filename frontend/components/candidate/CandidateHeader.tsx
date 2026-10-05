import type { ReactNode } from "react";

type CandidateHeaderProps = {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
};

/** Page header for the portal's inner pages. The dashboard has its own greeting. */
export function CandidateHeader({ title, subtitle, actions }: CandidateHeaderProps) {
  return (
    <header className="flex flex-col gap-3 pt-1 pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl leading-tight font-semibold tracking-[-0.02em] text-ink sm:text-[28px]">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-stone">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
