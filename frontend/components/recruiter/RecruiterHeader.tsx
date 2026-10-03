import type { ReactNode } from "react";

type RecruiterHeaderProps = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
};

/** Page header for the secondary recruiter pages. The dashboard has its own greeting header. */
export function RecruiterHeader({ title, subtitle, actions }: RecruiterHeaderProps) {
  return (
    <header className="flex flex-col gap-4 pt-2 pb-8 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-[34px] leading-tight font-semibold tracking-[-0.03em] text-ink sm:text-[40px]">{title}</h1>
        {subtitle && <p className="mt-2 text-[15px] text-stone">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
