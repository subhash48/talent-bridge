import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/** Shared by Input, Textarea and Select so every field looks and focuses the same way. */
export const fieldStyles =
  "w-full rounded-[8px] border border-border bg-ink/[0.03] px-3 text-sm text-ink placeholder:text-faint transition-[border-color,box-shadow,background-color] duration-150 hover:border-border-strong focus-visible:border-ink/45 focus-visible:bg-ink/[0.05] focus-visible:ring-[3px] focus-visible:ring-ink/10 focus-visible:outline-none disabled:opacity-50 aria-[invalid=true]:border-danger/60 aria-[invalid=true]:focus-visible:ring-danger/15";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(fieldStyles, "h-9", className)} {...props} />;
}
