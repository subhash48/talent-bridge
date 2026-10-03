import type { ComponentProps } from "react";

import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";

export function SearchBar({ className, placeholder = "Search", ...props }: ComponentProps<"input">) {
  return (
    <Input
      type="search"
      placeholder={placeholder}
      aria-label={placeholder}
      className={cn("max-w-sm", className)}
      {...props}
    />
  );
}
