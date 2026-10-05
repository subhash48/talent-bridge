import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("glass rounded-[14px] border border-border p-5", className)} {...props} />;
}
