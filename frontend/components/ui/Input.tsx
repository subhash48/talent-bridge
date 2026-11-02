import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/** Shared by Input, Textarea and Select so every field looks and focuses the same way. */
export const fieldStyles =
  "w-full rounded-[10px] border border-border-strong/70 bg-glass-strong px-3.5 text-sm text-ink placeholder:text-faint transition-[border-color,box-shadow,background-color] duration-150 hover:border-ink/25 focus-visible:border-accent focus-visible:bg-overlay focus-visible:ring-4 focus-visible:ring-accent/20 focus-visible:outline-none disabled:opacity-50 aria-[invalid=true]:border-danger/60 aria-[invalid=true]:focus-visible:ring-danger/15";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(fieldStyles, "h-10", className)} {...props} />;
}
