"use client";

import { motion } from "motion/react";
import { Tabs as TabsPrimitive } from "radix-ui";
import { useId, type ComponentProps } from "react";

import { cn } from "@/lib/utils";

export const Tabs = TabsPrimitive.Root;

type TabsListProps = {
  tabs: { value: string; label: string }[];
  /** The active tab, so the underline can glide to it. */
  value: string;
  label: string;
  className?: string;
};

export function TabsList({ tabs, value, label, className }: TabsListProps) {
  const indicatorId = useId();
  return (
    <TabsPrimitive.List aria-label={label} className={cn("scrollbar-none flex shrink-0 gap-5 overflow-x-auto border-b border-border", className)}>
      {tabs.map((tab) => (
        <TabsPrimitive.Trigger
          key={tab.value}
          value={tab.value}
          className="relative shrink-0 rounded-sm pt-1 pb-2.5 text-sm text-stone transition-colors duration-200 outline-none hover:text-charcoal focus-visible:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 data-[state=active]:text-ink"
        >
          {tab.label}
          {value === tab.value && (
            <motion.span
              layoutId={indicatorId}
              aria-hidden
              className="absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-ai"
              transition={{ type: "spring", stiffness: 520, damping: 42 }}
            />
          )}
        </TabsPrimitive.Trigger>
      ))}
    </TabsPrimitive.List>
  );
}

export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      className={cn("animate-rise outline-none focus-visible:outline-2 focus-visible:outline-offset-4", className)}
      {...props}
    />
  );
}
