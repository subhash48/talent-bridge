import type { LucideIcon } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

type SidebarNavItemProps = {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  /** Screen-reader text for a small ivory dot, e.g. unread conversations. */
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
        "group relative flex h-9 items-center gap-2.5 rounded-[8px] px-2.5 text-sm text-stone transition-[background-color,color] duration-200 hover:bg-ink/[0.04] hover:text-ink",
        active && "bg-ink/[0.08] font-medium text-ink ring-1 ring-ink/[0.1] hover:bg-ink/[0.08]",
      )}
    >
      {active && <span aria-hidden className="absolute top-1/2 left-0 h-3.5 w-[2px] -translate-y-1/2 rounded-r-full bg-ink" />}
      <Icon
        aria-hidden
        strokeWidth={1.75}
        className={cn("size-[17px] shrink-0 transition-colors", active ? "text-ink" : "text-stone group-hover:text-charcoal")}
      />
      <span className="flex-1">{label}</span>
      {indicator && (
        <span className="size-1.5 rounded-full bg-ink">
          <span className="sr-only">{indicator}</span>
        </span>
      )}
      {badge && badge.count > 0 && (
        <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-ink/15 px-1 text-[11px] font-semibold text-ink tabular-nums ring-1 ring-ink/25">
          <span aria-hidden>{badge.count}</span>
          <span className="sr-only">{badge.label}</span>
        </span>
      )}
    </Link>
  );
}
