import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/** A frosted panel on the mist: the app's one card. Pages set the radius and padding when theirs differ. */
export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("glass rounded-[20px] border border-border/70 p-5 sm:p-6", className)} {...props} />;
}
