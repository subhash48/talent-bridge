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
        "h-8 shrink-0 rounded-full px-3 text-[13px] whitespace-nowrap transition-[background-color,color,border-color] duration-200",
        active
          ? "bg-ink font-medium text-canvas"
          : "border border-border bg-ink/[0.04] text-charcoal hover:border-border-strong hover:bg-ink/[0.08] hover:text-ink",
        className,
      )}
      {...props}
    />
  );
}
