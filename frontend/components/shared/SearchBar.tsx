import { Search } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import { fieldStyles } from "@/components/ui/Input";
import { cn } from "@/lib/utils";

type SearchBarProps = Omit<ComponentProps<"input">, "type"> & {
  /** Rendered inside the field on the right, e.g. a keyboard shortcut hint. */
  trailing?: ReactNode;
  containerClassName?: string;
};

export function SearchBar({ className, containerClassName, placeholder = "Search", trailing, ...props }: SearchBarProps) {
  return (
    <div className={cn("relative", containerClassName)}>
      <Search aria-hidden className="pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-stone" />
      <input
        type="search"
        placeholder={placeholder}
        aria-label={placeholder}
        className={cn(fieldStyles, "h-12 rounded-[14px] pl-11 text-[15px] [&::-webkit-search-cancel-button]:hidden", trailing && "pr-16", className)}
        {...props}
      />
      {trailing && <div className="absolute top-1/2 right-3 -translate-y-1/2">{trailing}</div>}
    </div>
  );
}
