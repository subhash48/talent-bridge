"use client";

import {
  BriefcaseBusiness,
  CalendarDays,
  ChevronsUpDown,
  ExternalLink,
  LogOut,
  MessageSquareText,
  Settings,
  Sparkles,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useWorkspace } from "@/components/recruiter/WorkspaceProvider";
import { Avatar } from "@/components/shared/Avatar";
import { EncordLogo } from "@/components/shared/EncordLogo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/recruiter/candidates", label: "Candidates", icon: UsersRound },
  { href: "/recruiter/jobs", label: "Jobs", icon: BriefcaseBusiness },
  { href: "/recruiter/interviews", label: "Interviews", icon: CalendarDays },
  { href: "/recruiter/messages", label: "Messages", icon: MessageSquareText },
  { href: "/recruiter/ai", label: "AI Assistant", icon: Sparkles },
] as const;

type SidebarNavItemProps = {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  /** Screen-reader text for a small violet dot, e.g. unread conversations. */
  indicator?: string;
  onNavigate?: () => void;
};

export function SidebarNavItem({ href, label, icon: Icon, active, indicator, onNavigate }: SidebarNavItemProps) {
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
    </Link>
  );
}

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { user, unreadThreads } = useWorkspace();

  return (
    <div className="flex h-full flex-col px-4 pt-7 pb-5">
      <Link
        href="/recruiter/candidates"
        onClick={onNavigate}
        aria-label="Encord recruiting home"
        className="mb-10 flex w-fit items-center rounded-md px-3"
      >
        <EncordLogo />
      </Link>

      <nav aria-label="Primary" className="flex flex-col gap-1">
        {NAV.map((item) => (
          <SidebarNavItem
            key={item.href}
            {...item}
            active={pathname.startsWith(item.href)}
            indicator={
              item.href === "/recruiter/messages" && unreadThreads > 0
                ? `${unreadThreads} unread conversation${unreadThreads === 1 ? "" : "s"}`
                : undefined
            }
            onNavigate={onNavigate}
          />
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-4 pt-8">
        <SidebarNavItem
          href="/recruiter/settings"
          label="Settings"
          icon={Settings}
          active={pathname.startsWith("/recruiter/settings")}
          onNavigate={onNavigate}
        />
        <DropdownMenu>
          <DropdownMenuTrigger className="flex w-full items-center gap-3 rounded-[12px] border-t border-border px-2 pt-4 pb-1 text-left transition-colors hover:text-ink">
            <Avatar name={user.name} src={user.avatarUrl} size={40} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-medium text-ink">{user.name}</span>
              <span className="block truncate text-[13px] text-stone">{user.title}</span>
            </span>
            <ChevronsUpDown aria-hidden className="size-4 shrink-0 text-stone" />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-[220px]">
            <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
            <DropdownMenuItem asChild>
              <Link href="/recruiter/settings" onClick={onNavigate}>
                <Settings /> Profile and settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/candidate" onClick={onNavigate}>
                <ExternalLink /> Preview candidate portal
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/login">
                <LogOut /> Sign out
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
