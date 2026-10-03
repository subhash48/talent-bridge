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
        "flex flex-col items-center justify-center rounded-[18px] border border-dashed border-border px-6 py-14 text-center",
        className,
      )}
    >
      {Icon && (
        <span className="mb-4 flex size-11 items-center justify-center rounded-full bg-white/[0.05] ring-1 ring-white/10">
          <Icon aria-hidden className="size-5 text-stone" />
        </span>
      )}
      <p className="text-base font-medium text-ink">{title}</p>
      {description && <p className="mt-1.5 max-w-sm text-sm text-stone">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
