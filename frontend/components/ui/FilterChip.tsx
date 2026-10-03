import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

type FilterChipProps = Omit<ComponentProps<"button">, "type"> & { active: boolean };

/** Toggle-style pill used for stage and status filters. Group several in a role="group". */
export function FilterChip({ active, className, ...props }: FilterChipProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        "h-9 shrink-0 rounded-full px-4 text-sm whitespace-nowrap transition-[background-color,color,border-color] duration-200",
        active
          ? "bg-ink font-medium text-canvas"
          : "border border-border bg-white/[0.04] text-charcoal hover:border-border-strong hover:bg-white/[0.08] hover:text-ink",
        className,
      )}
      {...props}
    />
  );
}
