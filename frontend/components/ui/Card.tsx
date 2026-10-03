import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("rounded-[14px] border border-border bg-surface-raised p-6 shadow-soft", className)}
      {...props}
    />
  );
}
