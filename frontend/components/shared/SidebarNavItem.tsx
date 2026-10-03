import type { LucideIcon } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

type SidebarNavItemProps = {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  /** Screen-reader text for a small violet dot, e.g. unread conversations. */
  indicator?: string;
  /** A count shown as a pill, e.g. unread messages, with its screen-reader text. */
  badge?: { count: number; label: string };
  onNavigate?: () => void;
};

/** One item of the recruiter workspace's and candidate portal's sidebars. */
export function SidebarNavItem({ href, label, icon: Icon, active, indicator, badge, onNavigate }: SidebarNavItemProps) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex h-11 items-center gap-3 rounded-[12px] px-3 text-[15px] text-stone transition-[background-color,color] duration-200 hover:bg-white/[0.04] hover:text-ink",
        active && "bg-white/[0.07] text-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.06)] ring-1 ring-white/[0.05] hover:bg-white/[0.07]",
      )}
    >
      {active && <span aria-hidden className="absolute top-1/2 left-0 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-white/80" />}
      <Icon
        aria-hidden
        strokeWidth={1.75}
        className={cn("size-[19px] shrink-0 transition-colors", active ? "text-ink" : "text-stone group-hover:text-charcoal")}
      />
      <span className="flex-1">{label}</span>
      {indicator && (
        <span className="size-1.5 rounded-full bg-ai shadow-[0_0_8px_rgb(165_148_249/0.8)]">
          <span className="sr-only">{indicator}</span>
        </span>
      )}
      {badge && badge.count > 0 && (
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-ai/20 px-1.5 text-[11px] font-semibold text-violet-100 tabular-nums ring-1 ring-ai/40">
          <span aria-hidden>{badge.count}</span>
          <span className="sr-only">{badge.label}</span>
        </span>
      )}
    </Link>
  );
}
