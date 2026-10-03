import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

const VARIANTS = {
  primary:
    "bg-ink text-canvas shadow-[inset_0_1px_0_rgb(255_255_255/0.6),0_10px_30px_-14px_rgb(255_255_255/0.45)] hover:bg-white",
  secondary: "border border-border bg-white/[0.04] text-ink hover:border-border-strong hover:bg-white/[0.07]",
  ghost: "text-stone hover:bg-muted hover:text-ink",
  ai: "border border-ai/25 bg-ai/12 text-violet-100 hover:border-ai/40 hover:bg-ai/20",
  danger: "border border-danger/25 bg-danger/12 text-red-100 hover:bg-danger/20",
} as const;

const SIZES = {
  sm: "h-8 gap-1.5 rounded-[9px] px-3 text-xs [&_svg]:size-3.5",
  md: "h-10 gap-2 rounded-[10px] px-4 text-sm [&_svg]:size-4",
  lg: "h-12 gap-2.5 rounded-[12px] px-5 text-[15px] [&_svg]:size-[18px]",
  icon: "size-10 rounded-[10px] [&_svg]:size-[18px]",
  "icon-sm": "size-8 rounded-[9px] [&_svg]:size-4",
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
