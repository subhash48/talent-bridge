import Image from "next/image";

import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

type EmployerLogoProps = {
  name: string;
  logoUrl?: string | null;
  size?: number;
  className?: string;
};

/** The employer behind an application: its logo, or its initials on a tile. Decorative: its name is always shown beside it. */
export function EmployerLogo({ name, logoUrl, size = 28, className }: EmployerLogoProps) {
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 overflow-hidden rounded-[7px] ring-1 ring-ink/10", className)}
      style={{ width: size, height: size }}
    >
      {logoUrl ? (
        <Image src={logoUrl} alt="" width={size} height={size} unoptimized className="size-full object-cover" />
      ) : (
        <span
          className="flex size-full items-center justify-center bg-ink/[0.06] font-semibold tracking-tight text-ink"
          style={{ fontSize: Math.max(10, Math.round(size * 0.38)) }}
        >
          {initials(name)}
        </span>
      )}
    </span>
  );
}
