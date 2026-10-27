import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/** Shared by Input, Textarea and Select so every field looks and focuses the same way. */
export const fieldStyles =
  "w-full rounded-[10px] border border-border-strong/80 bg-surface-raised px-3 text-sm text-ink placeholder:text-faint transition-[border-color,box-shadow,background-color] duration-150 hover:border-ink/30 focus-visible:border-brand focus-visible:bg-overlay focus-visible:ring-4 focus-visible:ring-accent/50 focus-visible:outline-none disabled:opacity-50 aria-[invalid=true]:border-danger/60 aria-[invalid=true]:focus-visible:ring-danger/15";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(fieldStyles, "h-9", className)} {...props} />;
}
