import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type EmptyStateProps = {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ title, description, icon: Icon, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-[16px] border border-dashed border-border-strong/60 bg-glass/40 px-5 py-10 text-center",
        className,
      )}
    >
      {Icon && (
        <span className="mb-3 flex size-9 items-center justify-center rounded-full bg-accent-soft/80 ring-1 ring-accent/15">
          <Icon aria-hidden className="size-4 text-brand-ink" />
        </span>
      )}
      <p className="text-[0.9375rem] font-medium text-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-[13px] text-stone">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
