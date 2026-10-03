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

// Muted tints keep initials avatars distinguishable without adding loud colour to the table.
const TINTS = [
  "from-violet-300/30 to-violet-300/5 text-violet-100",
  "from-sky-300/30 to-sky-300/5 text-sky-100",
  "from-emerald-300/25 to-emerald-300/5 text-emerald-100",
  "from-amber-300/25 to-amber-300/5 text-amber-100",
  "from-rose-300/25 to-rose-300/5 text-rose-100",
  "from-teal-300/25 to-teal-300/5 text-teal-100",
  "from-indigo-300/30 to-indigo-300/5 text-indigo-100",
  "from-zinc-300/25 to-zinc-300/5 text-zinc-100",
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
            "flex size-full items-center justify-center rounded-full bg-linear-to-br font-medium tracking-tight ring-1 ring-white/10 ring-inset",
            tintFor(name),
          )}
          style={{ fontSize: Math.max(11, Math.round(size * 0.36)) }}
        >
          {initials(name)}
        </span>
      )}
      {online && (
        <span
          className="absolute right-0 bottom-0 rounded-full bg-emerald-400 ring-[3px] ring-surface"
          style={{ width: Math.max(8, size * 0.2), height: Math.max(8, size * 0.2) }}
        >
          <span className="sr-only">Recently active</span>
        </span>
      )}
    </span>
  );
}
