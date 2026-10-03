import type { ReactNode } from "react";

type EmptyStateProps = {
  title: string;
  description?: string;
  action?: ReactNode;
};

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[14px] border border-dashed border-border px-6 py-16 text-center">
      <p className="font-display text-2xl text-ink">{title}</p>
      {description && <p className="mt-2 max-w-sm text-sm text-stone">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
