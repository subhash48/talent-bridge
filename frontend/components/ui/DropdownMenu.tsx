"use client";

import { Check, ChevronRight } from "lucide-react";
import { DropdownMenu as Menu } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

// shadcn-style wrappers over Radix DropdownMenu: arrow-key navigation, typeahead and focus return.

export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;
export const DropdownMenuGroup = Menu.Group;
export const DropdownMenuSub = Menu.Sub;
export const DropdownMenuRadioGroup = Menu.RadioGroup;

const surface =
  "z-50 min-w-[190px] overflow-hidden rounded-[10px] border border-border bg-overlay/95 p-1 text-[13px] text-charcoal shadow-[0_24px_48px_-12px_rgb(0_0_0/0.8)] backdrop-blur-xl data-[state=closed]:animate-pop-out data-[state=open]:animate-pop-in";

const item =
  "relative flex h-8 cursor-default items-center gap-2 rounded-[6px] px-2 outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-ink/[0.07] data-[highlighted]:text-ink [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-stone";

export function DropdownMenuContent({ className, sideOffset = 6, align = "end", ...props }: ComponentProps<typeof Menu.Content>) {
  return (
    <Menu.Portal>
      <Menu.Content sideOffset={sideOffset} align={align} className={cn(surface, className)} {...props} />
    </Menu.Portal>
  );
}

export function DropdownMenuItem({
  className,
  destructive,
  ...props
}: ComponentProps<typeof Menu.Item> & { destructive?: boolean }) {
  return (
    <Menu.Item
      className={cn(
        item,
        destructive && "text-danger data-[highlighted]:bg-danger/10 data-[highlighted]:text-danger [&_svg]:text-danger",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuCheckboxItem({ className, children, ...props }: ComponentProps<typeof Menu.CheckboxItem>) {
  return (
    <Menu.CheckboxItem className={cn(item, "pr-8", className)} {...props}>
      {children}
      <Menu.ItemIndicator className="absolute right-2.5">
        <Check className="text-ink!" />
      </Menu.ItemIndicator>
    </Menu.CheckboxItem>
  );
}

export function DropdownMenuRadioItem({ className, children, ...props }: ComponentProps<typeof Menu.RadioItem>) {
  return (
    <Menu.RadioItem className={cn(item, "pr-8", className)} {...props}>
      {children}
      <Menu.ItemIndicator className="absolute right-2.5">
        <Check className="text-ink!" />
      </Menu.ItemIndicator>
    </Menu.RadioItem>
  );
}

export function DropdownMenuSubTrigger({ className, children, ...props }: ComponentProps<typeof Menu.SubTrigger>) {
  return (
    <Menu.SubTrigger className={cn(item, "data-[state=open]:bg-ink/[0.07]", className)} {...props}>
      {children}
      <ChevronRight className="ml-auto" />
    </Menu.SubTrigger>
  );
}

export function DropdownMenuSubContent({ className, ...props }: ComponentProps<typeof Menu.SubContent>) {
  return (
    <Menu.Portal>
      <Menu.SubContent sideOffset={6} className={cn(surface, "min-w-[180px]", className)} {...props} />
    </Menu.Portal>
  );
}

export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof Menu.Label>) {
  return <Menu.Label className={cn("px-2 pt-1.5 pb-1 text-xs font-medium text-faint", className)} {...props} />;
}

export function DropdownMenuSeparator({ className, ...props }: ComponentProps<typeof Menu.Separator>) {
  return <Menu.Separator className={cn("-mx-1 my-1 h-px bg-border", className)} {...props} />;
}
