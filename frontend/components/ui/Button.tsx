import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

const VARIANTS = {
  primary: "bg-ink text-canvas hover:bg-charcoal",
  secondary: "border border-border bg-surface-raised text-ink shadow-soft hover:shadow-raised",
  ghost: "text-stone hover:bg-muted hover:text-ink",
} as const;

type ButtonProps = ComponentProps<"button"> & { variant?: keyof typeof VARIANTS };

export function Button({ variant = "primary", type = "button", className, ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-[10px] px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}
