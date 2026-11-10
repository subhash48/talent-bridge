"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState, type ComponentProps } from "react";

import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";

/** A password field with a show/hide button inside its right edge, so people can check what they typed. */
export function PasswordInput({ className, ...props }: Omit<ComponentProps<"input">, "type">) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      {/* pr-11 last, so a caller's px-* can't take the room the button needs. */}
      <Input type={shown ? "text" : "password"} className={cn(className, "pr-11")} {...props} />
      <button
        type="button"
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
        aria-controls={props.id}
        onClick={() => setShown((value) => !value)}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-[10px] text-stone transition-colors hover:text-ink focus-visible:text-ink focus-visible:ring-4 focus-visible:ring-accent/20 focus-visible:outline-none"
      >
        {shown ? <EyeOff aria-hidden className="size-[1.125rem]" /> : <Eye aria-hidden className="size-[1.125rem]" />}
      </button>
    </div>
  );
}
