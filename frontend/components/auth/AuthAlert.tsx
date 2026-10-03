import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const TONES = {
  error: "border-danger/25 bg-danger/10 text-red-200",
  success: "border-sage/25 bg-sage/10 text-green-100",
  info: "border-ai/25 bg-ai/10 text-violet-100",
} as const;

export function AuthAlert({ tone = "error", children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("rounded-[10px] border px-3 py-2.5 text-sm leading-relaxed", TONES[tone])}
    >
      {children}
    </div>
  );
}
