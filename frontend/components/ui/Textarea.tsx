import type { ComponentProps } from "react";

import { fieldStyles } from "@/components/ui/Input";
import { cn } from "@/lib/utils";

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(fieldStyles, "resize-none py-2.5 leading-relaxed", className)} {...props} />;
}
