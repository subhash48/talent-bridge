import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

const VARIANTS = {
  // Blue: the one action that matters most wherever it appears.
  primary:
    "bg-brand text-on-brand shadow-[inset_0_1px_0_rgb(255_255_255/0.16),0_8px_20px_-10px_rgb(50_102_255/0.7)] hover:bg-brand-hover",
  // Translucent white with a navy hairline: the second action beside a primary one.
  secondary: "border border-ink/15 bg-glass-strong text-ink backdrop-blur-md hover:border-ink/25 hover:bg-overlay",
  ghost: "text-stone hover:bg-muted hover:text-ink",
  ai: "border border-accent/20 bg-accent-soft/80 text-brand-ink hover:border-accent/40 hover:bg-accent-soft",
  danger: "border border-danger/25 bg-danger/[0.06] text-danger hover:bg-danger/[0.12]",
  // Over the sky: frosted glass that keeps the gradient showing through.
  glass: "bg-glass text-ink ring-1 ring-ink/10 backdrop-blur-md hover:bg-glass-strong",
  // Blue, for the one action that matters most on a page (the assistant, the hero's prompt).
  accent: "bg-accent text-on-brand shadow-[0_10px_24px_-10px_rgb(47_107_255/0.7)] hover:bg-brand-ink",
} as const;

const SIZES = {
  sm: "h-8 gap-1.5 rounded-full px-3 text-xs [&_svg]:size-3.5",
  md: "h-9 gap-2 rounded-full px-4 text-[13px] [&_svg]:size-4",
  lg: "h-11 gap-2 rounded-full px-5 text-sm [&_svg]:size-4",
  // The website's calls to action.
  xl: "h-12 gap-2 rounded-full px-6 text-[15px] [&_svg]:size-4",
  icon: "size-9 rounded-full [&_svg]:size-[17px]",
  "icon-sm": "size-8 rounded-full [&_svg]:size-3.5",
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
