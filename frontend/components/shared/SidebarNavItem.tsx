import type { LucideIcon } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

type SidebarNavItemProps = {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  /** Screen-reader text for a small amber dot, e.g. unread conversations. */
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
        "group relative flex h-10 items-center gap-3 rounded-[10px] px-3 text-sm text-stone transition-[background-color,color,box-shadow] duration-200 hover:bg-ink/[0.04] hover:text-ink",
        active && "bg-overlay font-medium text-ink shadow-soft ring-1 ring-ink/[0.06] hover:bg-overlay hover:text-ink",
      )}
    >
      <Icon
        aria-hidden
        strokeWidth={1.75}
        className={cn("size-[18px] shrink-0 transition-colors", active ? "text-brand-ink" : "text-faint group-hover:text-charcoal")}
      />
      <span className="flex-1">{label}</span>
      {indicator && (
        <span className="size-1.5 rounded-full bg-highlight">
          <span className="sr-only">{indicator}</span>
        </span>
      )}
      {badge && badge.count > 0 && (
        <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand px-1 text-[11px] font-semibold text-on-brand tabular-nums">
          <span aria-hidden>{badge.count}</span>
          <span className="sr-only">{badge.label}</span>
        </span>
      )}
    </Link>
  );
}
