import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

// TalentBridge's mark: a bridge, drawn in currentColor so it takes the text colour around it.
export function TalentBridgeMark({ className, ...props }: ComponentProps<"svg">) {
  return (
    <svg
      viewBox="0 0 48 40"
      fill="none"
      stroke="currentColor"
      strokeWidth={4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...props}
    >
      <path d="M6 26C12 10 36 10 42 26" />
      <path d="M3 26h42" />
      <path d="M14 26v10M34 26v10" />
      <path d="M24 15v11" />
    </svg>
  );
}

export function TalentBridgeLogo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-ink", className)}>
      <TalentBridgeMark className="h-5 w-auto" />
      <span className="text-[15px] font-semibold tracking-[-0.01em]">TalentBridge</span>
    </span>
  );
}

/** For pages a hiring company shows its candidates (the portal, the careers site). */
export function PoweredByTalentBridge({ className }: { className?: string }) {
  return (
    <p className={cn("flex items-center gap-1.5 text-xs text-faint", className)}>
      Powered by <TalentBridgeMark className="h-3 w-auto" /> TalentBridge
    </p>
  );
}
