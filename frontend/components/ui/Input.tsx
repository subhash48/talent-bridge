import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "w-full rounded-[10px] border border-border bg-surface-raised px-3 py-2 text-sm text-ink shadow-[inset_0_1px_2px_rgb(20_20_19/0.06)] placeholder:text-stone focus:outline-none focus:ring-2 focus:ring-sage/40",
        className,
      )}
      {...props}
    />
  );
}
