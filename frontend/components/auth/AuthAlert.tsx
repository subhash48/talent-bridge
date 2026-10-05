import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const TONES = {
  error: "border-danger/25 bg-danger/10 text-danger",
  success: "border-sage/25 bg-sage/10 text-sage",
  info: "border-ai/25 bg-ai/10 text-ink",
} as const;

export function AuthAlert({ tone = "error", children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("rounded-[8px] border px-3 py-2.5 text-sm leading-relaxed", TONES[tone])}
    >
      {children}
    </div>
  );
}
