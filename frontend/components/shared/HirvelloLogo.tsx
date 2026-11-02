import { useId, type ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * Hirvello's mark: a blue tile with a V, the open end of a search that found someone, and a spark above it.
 * Light is for the mist and other light backgrounds, dark for the blue ones; mono takes the text colour around it.
 */
type Tone = "light" | "dark" | "mono";

type MarkProps = ComponentProps<"svg"> & { tone?: Tone };

export function HirvelloMark({ tone = "light", className, ...props }: MarkProps) {
  // Each mark owns its gradient: a shared id would resolve to the first mark in the document, which may be in a
  // hidden sidebar, and a gradient inside a hidden subtree doesn't paint.
  const gradient = useId();
  const mono = tone === "mono";
  const tile = mono ? "currentColor" : tone === "dark" ? "rgb(255 255 255 / 0.16)" : `url(#${gradient})`;
  const glyph = mono ? "var(--color-canvas)" : "#f8fbff";
  const spark = mono ? "var(--color-canvas)" : "#cfe4ff";
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false" className={cn("h-6 w-auto shrink-0", className)} {...props}>
      {tone === "light" && (
        <defs>
          <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#3266ff" />
            <stop offset="1" stopColor="#10213d" />
          </linearGradient>
        </defs>
      )}
      <rect width="64" height="64" rx="17" fill={tile} />
      <path d="M18 24 32 41 46 24" fill="none" stroke={glyph} strokeWidth="6.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="46.5" cy="15" r="3.6" fill={spark} />
    </svg>
  );
}

/** The wordmark: hirvello, lower case, with its v in blue. It reads as "Hirvello" to screen readers. */
export function HirvelloWordmark({ tone = "light", className }: { tone?: Tone; className?: string }) {
  return (
    <span
      role="img"
      aria-label="Hirvello"
      className={cn("font-sans text-[21px] leading-none font-semibold tracking-[-0.045em] whitespace-nowrap", className)}
    >
      <span aria-hidden>hir</span>
      <span aria-hidden className={tone === "light" ? "text-accent" : tone === "dark" ? "text-sky" : "opacity-70"}>
        v
      </span>
      <span aria-hidden>ello</span>
    </span>
  );
}

/** The mark and the wordmark side by side, as on every header. */
export function HirvelloLogo({ tone = "light", className }: { tone?: Tone; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", tone === "dark" ? "text-on-brand" : "text-ink", className)}>
      <HirvelloMark tone={tone} className="h-[22px]" />
      <HirvelloWordmark tone={tone} />
    </span>
  );
}
