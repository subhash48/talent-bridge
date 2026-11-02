import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const TONES = {
  error: "border-danger/25 bg-danger/[0.07] text-danger",
  success: "border-success/25 bg-success/[0.07] text-success",
  info: "border-brand-ink/25 bg-brand-soft text-ink",
} as const;

export function AuthAlert({ tone = "error", children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("rounded-[12px] border px-3.5 py-2.5 text-sm leading-relaxed", TONES[tone])}
    >
      {children}
    </div>
  );
}
