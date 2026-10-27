import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

const VARIANTS = {
  primary:
    "bg-brand text-on-brand shadow-[inset_0_1px_0_rgb(244_236_220/0.12),0_8px_20px_-12px_rgb(18_53_59/0.7)] hover:bg-brand-hover",
  secondary: "border border-border-strong/80 bg-overlay/60 text-ink hover:border-border-strong hover:bg-overlay",
  ghost: "text-stone hover:bg-muted hover:text-ink",
  ai: "border border-brand-ink/15 bg-accent-soft/70 text-brand-ink hover:border-brand-ink/30 hover:bg-accent-soft",
  danger: "border border-danger/25 bg-danger/[0.06] text-danger hover:bg-danger/[0.12]",
  // Over a picture: frosted cream that keeps the picture showing through.
  glass: "bg-overlay/70 text-ink ring-1 ring-ink/10 backdrop-blur-md hover:bg-overlay/90",
} as const;

const SIZES = {
  sm: "h-7 gap-1.5 rounded-[8px] px-2.5 text-xs [&_svg]:size-3.5",
  md: "h-9 gap-2 rounded-[10px] px-3.5 text-[13px] [&_svg]:size-4",
  lg: "h-10 gap-2 rounded-[10px] px-4 text-sm [&_svg]:size-4",
  // The website's calls to action.
  xl: "h-12 gap-2 rounded-full px-6 text-[15px] [&_svg]:size-4",
  icon: "size-9 rounded-[10px] [&_svg]:size-[17px]",
  "icon-sm": "size-7 rounded-[8px] [&_svg]:size-3.5",
} as const;

export type ButtonVariant = keyof typeof VARIANTS;
export type ButtonSize = keyof typeof SIZES;

type StyleOptions = { variant?: ButtonVariant; size?: ButtonSize; className?: string };

/** Button classes, also used to style links that look like buttons. */
export function buttonStyles({ variant = "primary", size = "md", className }: StyleOptions = {}) {
  return cn(
    "inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-out select-none active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0",
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

type ButtonProps = ComponentProps<"button"> & StyleOptions;

export function Button({ variant, size, type = "button", className, ...props }: ButtonProps) {
  return <button type={type} className={buttonStyles({ variant, size, className })} {...props} />;
}
