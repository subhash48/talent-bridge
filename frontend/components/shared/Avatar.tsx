import Image from "next/image";

import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

type AvatarProps = {
  name: string;
  src?: string | null;
  size?: number;
  /** Shows a green dot, e.g. for a candidate active in the portal in the last few hours. */
  online?: boolean;
  className?: string;
};

// Two neutral and two soft sage tints: initials avatars stay distinguishable without adding new colours.
const TINTS = [
  "bg-ink/[0.08] text-ink",
  "bg-accent-soft text-brand-ink",
  "bg-ink/[0.12] text-ink",
  "bg-accent/60 text-ink",
];

function tintFor(name: string) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TINTS[hash % TINTS.length];
}

// Decorative: the person's name is always rendered next to it.
export function Avatar({ name, src, size = 32, online, className }: AvatarProps) {
  return (
    <span className={cn("relative inline-flex shrink-0", className)} style={{ width: size, height: size }}>
      {src ? (
        <Image src={src} alt="" width={size} height={size} unoptimized className="size-full rounded-full object-cover" />
      ) : (
        <span
          aria-hidden
          className={cn(
            "flex size-full items-center justify-center rounded-full font-medium tracking-tight ring-1 ring-ink/10 ring-inset",
            tintFor(name),
          )}
          style={{ fontSize: Math.max(11, Math.round(size * 0.36)) }}
        >
          {initials(name)}
        </span>
      )}
      {online && (
        <span
          className="absolute right-0 bottom-0 rounded-full bg-sage ring-[3px] ring-surface"
          style={{ width: Math.max(8, size * 0.2), height: Math.max(8, size * 0.2) }}
        >
          <span className="sr-only">Recently active</span>
        </span>
      )}
    </span>
  );
}
