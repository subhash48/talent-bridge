"use client";

import Image from "next/image";
import { useCallback, useState } from "react";

import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

type CompanyLogoProps = { name: string; logoUrl?: string | null; size?: number; className?: string };

/**
 * The employer's logo, or its initials on a soft periwinkle tile when it has none or the image won't load.
 * Decorative: the company's name is always written beside it.
 */
export function CompanyLogo({ name, logoUrl, size = 44, className }: CompanyLogoProps) {
  // Keyed by the URL, so a different logo gets its own chance to load.
  const [failed, setFailed] = useState<string | null>(null);
  const showImage = Boolean(logoUrl) && failed !== logoUrl;

  // An image can fail before React hydrates and attaches onError; a loaded image with no width has failed too.
  const checkLoaded = useCallback(
    (image: HTMLImageElement | null) => {
      if (image && logoUrl && image.complete && image.naturalWidth === 0) setFailed(logoUrl);
    },
    [logoUrl],
  );

  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 overflow-hidden rounded-[12px] ring-1 ring-ink/[0.08]", className)}
      style={{ width: size, height: size }}
    >
      {showImage && logoUrl ? (
        <Image
          ref={checkLoaded}
          src={logoUrl}
          alt=""
          width={size}
          height={size}
          unoptimized
          onError={() => setFailed(logoUrl)}
          className="size-full bg-white/60 object-contain"
        />
      ) : (
        <span
          className="flex size-full items-center justify-center bg-linear-to-br from-[#e6ecff] to-[#d8e2ff] font-semibold tracking-tight text-brand-ink"
          style={{ fontSize: Math.max(11, Math.round(size * 0.36)) }}
        >
          {initials(name) || "?"}
        </span>
      )}
    </span>
  );
}
