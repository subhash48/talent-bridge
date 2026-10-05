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
        "flex flex-col items-center justify-center rounded-[14px] border border-dashed border-border px-5 py-10 text-center",
        className,
      )}
    >
      {Icon && (
        <span className="mb-3 flex size-9 items-center justify-center rounded-full bg-ink/[0.05] ring-1 ring-ink/10">
          <Icon aria-hidden className="size-4 text-stone" />
        </span>
      )}
      <p className="text-[15px] font-medium text-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-[13px] text-stone">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
