import { Check, CircleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** The box every assistant card sits in, with its small uppercase label. */
export function Frame({
  label,
  tone = "neutral",
  className,
  children,
}: {
  label: ReactNode;
  tone?: "neutral" | "done" | "failed";
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("mt-2.5 animate-rise rounded-[12px] border border-border bg-ink/[0.025] p-3.5 sm:p-4", className)}>
      <p
        className={cn(
          "flex items-center gap-1.5 text-[11px] font-medium tracking-wide uppercase",
          tone === "done" ? "text-sage" : tone === "failed" ? "text-danger" : "text-faint",
        )}
      >
        {tone === "done" && <Check aria-hidden className="size-3.5" strokeWidth={2.5} />}
        {tone === "failed" && <CircleAlert aria-hidden className="size-3.5" />}
        {label}
      </p>
      {children}
    </div>
  );
}

export function Chips({ items }: { items: (string | null | undefined)[] }) {
  const shown = items.filter(Boolean) as string[];
  if (!shown.length) return null;
  return (
    <ul className="mt-2 flex flex-wrap gap-1.5">
      {shown.map((item) => (
        <li key={item} className="inline-flex h-6 items-center rounded-full bg-ink/[0.05] px-2.5 text-xs text-charcoal ring-1 ring-ink/10">
          {item}
        </li>
      ))}
    </ul>
  );
}

/** A card an update replaced further down the conversation: shown small, without its buttons. */
export function Superseded({ label }: { label: string }) {
  return <p className="mt-2 rounded-[10px] border border-dashed border-border px-3 py-2 text-xs text-faint">{label} · updated below</p>;
}
