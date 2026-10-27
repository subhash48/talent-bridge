import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * Kavuntra's mark: a K grown from three leaves, a stem and two leaves crossing at its waist. Light is for
 * cream and other light backgrounds, dark for the teal ones; mono takes the text colour around it.
 */
type Tone = "light" | "dark" | "mono";

const LEAVES: Record<Tone, readonly [stem: string, lower: string, upper: string]> = {
  light: ["#2f5a5c", "#224047", "#8fae86"],
  dark: ["#9fb892", "#5f8a6e", "#f2deb7"],
  mono: ["currentColor", "currentColor", "currentColor"],
};

const STEM = "M2.6.8C17 9 27 22 27 40v78H3.2A3.2 3.2 0 0 1 0 114.8V3.4C0 1.2 1.2.1 2.6.8Z";
const LOWER = "M30 80c18-8 40-6 54 10 8 9 13 18 16 27-12 1.4-30-1-44-9-12-7-20-16-26-28Z";
const UPPER = "M2 118c10-22 20-46 38-64C56 38 78 32 100 33c-6 17-20 31-40 36-14 3-26 7-33 15C18 94 9 107 2 118Z";

type MarkProps = ComponentProps<"svg"> & { tone?: Tone };

export function KavuntraMark({ tone = "light", className, ...props }: MarkProps) {
  const [stem, lower, upper] = LEAVES[tone];
  const mono = tone === "mono";
  return (
    <svg
      viewBox="0 0 100 120"
      aria-hidden="true"
      focusable="false"
      className={cn("h-6 w-auto shrink-0", className)}
      {...props}
    >
      <path d={STEM} fill={stem} />
      <path d={LOWER} fill={lower} opacity={mono ? 0.72 : 1} />
      <path d={UPPER} fill={upper} opacity={mono ? 0.5 : 1} />
    </svg>
  );
}

// KAVUNTRA in the mark's own letterforms: open geometric strokes, the A drawn without a crossbar.
const LETTERS = [
  "M1 0v10M7.4 0 2.2 5 7.4 10", // K
  "M0 10 4 0l4 10", // A
  "M0 0l4 10 4-10", // V
  "M0 0v5.6a4 4 0 0 0 8 0V0", // U
  "M0 10V0l8 10V0", // N
  "M0 .6h8M4 .6V10", // T
  "M.6 10V.6h4.2a2.6 2.6 0 0 1 0 5.2H.6m4 0L8 10", // R
  "M0 10 4 0l4 10", // A
];
const ADVANCE = 13;

/** The wordmark alone, in currentColor. It reads as "Kavuntra" to screen readers. */
export function KavuntraWordmark({ className, ...props }: ComponentProps<"svg">) {
  return (
    <svg
      viewBox={`-1 -1 ${ADVANCE * (LETTERS.length - 1) + 10} 12`}
      role="img"
      aria-label="Kavuntra"
      className={cn("h-[11px] w-auto shrink-0", className)}
      {...props}
    >
      <g fill="none" stroke="currentColor" strokeWidth={1.25} strokeLinejoin="miter" strokeLinecap="butt">
        {LETTERS.map((d, index) => (
          <path key={index} d={d} transform={`translate(${index * ADVANCE} 0)`} />
        ))}
      </g>
    </svg>
  );
}

/** The mark and the wordmark side by side, as on every header. */
export function KavuntraLogo({ tone = "light", className }: { tone?: Tone; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", tone === "dark" ? "text-on-brand" : "text-ink", className)}>
      <KavuntraMark tone={tone} className="h-[22px]" />
      <KavuntraWordmark />
    </span>
  );
}
