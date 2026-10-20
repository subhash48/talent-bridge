"use client";

import { Check, Minus } from "lucide-react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export function Checkbox({ className, checked, ...props }: ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      checked={checked}
      className={cn(
        "inline-flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-ink/30 bg-overlay text-on-brand transition-colors duration-150 hover:border-ink/50 data-[state=checked]:border-brand data-[state=checked]:bg-brand data-[state=indeterminate]:border-brand data-[state=indeterminate]:bg-brand",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator>
        {checked === "indeterminate" ? <Minus className="size-3" strokeWidth={3} /> : <Check className="size-3" strokeWidth={3} />}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
