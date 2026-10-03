import type { ReactNode } from "react";

import { SearchBar } from "@/components/shared/SearchBar";

type RecruiterHeaderProps = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
};

export function RecruiterHeader({ title, subtitle, actions }: RecruiterHeaderProps) {
  return (
    <header className="mb-8 flex items-end justify-between gap-6">
      <div>
        <h1 className="font-display text-4xl text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-stone">{subtitle}</p>}
      </div>
      {actions ?? <SearchBar placeholder="Search candidates, jobs, skills, messages" />}
    </header>
  );
}
