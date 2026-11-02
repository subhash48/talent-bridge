import { ChevronDown } from "lucide-react";
import type { ComponentProps } from "react";

import { fieldStyles } from "@/components/ui/Input";
import { cn } from "@/lib/utils";

// Native select: keyboard, screen reader and mobile pickers work for free.
export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <div className="relative">
      <select className={cn(fieldStyles, "h-10 appearance-none pr-9 [&>option]:bg-overlay [&>option]:text-ink", className)} {...props}>
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-stone"
      />
    </div>
  );
}
