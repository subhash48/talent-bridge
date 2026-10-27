import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("glass rounded-[18px] border border-border/80 p-5 sm:p-6", className)} {...props} />;
}
