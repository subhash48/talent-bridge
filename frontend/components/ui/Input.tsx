import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/** Shared by Input, Textarea and Select so every field looks and focuses the same way. */
export const fieldStyles =
  "w-full rounded-[10px] border border-border bg-white/[0.03] px-3 text-sm text-ink placeholder:text-faint transition-[border-color,box-shadow,background-color] duration-150 hover:border-border-strong focus-visible:border-white/30 focus-visible:bg-white/[0.05] focus-visible:ring-4 focus-visible:ring-white/[0.06] focus-visible:outline-none disabled:opacity-50 aria-[invalid=true]:border-danger/60 aria-[invalid=true]:focus-visible:ring-danger/15";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(fieldStyles, "h-10", className)} {...props} />;
}
