import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

const VARIANTS = {
  primary: "bg-ink text-canvas hover:bg-ink-bright",
  secondary: "border border-border bg-ink/[0.04] text-ink hover:border-border-strong hover:bg-ink/[0.07]",
  ghost: "text-stone hover:bg-muted hover:text-ink",
  ai: "border border-ink/20 bg-ink/[0.08] text-ink hover:border-ink/35 hover:bg-ink/[0.13]",
  danger: "border border-danger/25 bg-danger/12 text-danger hover:bg-danger/20",
} as const;

const SIZES = {
  sm: "h-7 gap-1.5 rounded-[6px] px-2.5 text-xs [&_svg]:size-3.5",
  md: "h-9 gap-2 rounded-[8px] px-3.5 text-[13px] [&_svg]:size-4",
  lg: "h-10 gap-2 rounded-[8px] px-4 text-sm [&_svg]:size-4",
  icon: "size-9 rounded-[8px] [&_svg]:size-[17px]",
  "icon-sm": "size-7 rounded-[6px] [&_svg]:size-3.5",
} as const;

export type ButtonVariant = keyof typeof VARIANTS;
export type ButtonSize = keyof typeof SIZES;

type StyleOptions = { variant?: ButtonVariant; size?: ButtonSize; className?: string };

/** Button classes, also used to style links that look like buttons. */
export function buttonStyles({ variant = "primary", size = "md", className }: StyleOptions = {}) {
  return cn(
    "inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-[background-color,border-color,color,box-shadow,transform] duration-200 select-none active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0",
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

type ButtonProps = ComponentProps<"button"> & StyleOptions;

export function Button({ variant, size, type = "button", className, ...props }: ButtonProps) {
  return <button type={type} className={buttonStyles({ variant, size, className })} {...props} />;
}
