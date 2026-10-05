"use client";

import {
  BriefcaseBusiness,
  CalendarDays,
  ChevronsUpDown,
  LogOut,
  MessageSquareText,
  Settings,
  Sparkles,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useWorkspace } from "@/components/recruiter/WorkspaceProvider";
import { Avatar } from "@/components/shared/Avatar";
import { EncordLogo } from "@/components/shared/EncordLogo";
import { SidebarNavItem } from "@/components/shared/SidebarNavItem";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import { useSignOut } from "@/hooks/useSignOut";

const NAV = [
  { href: "/recruiter/candidates", label: "Candidates", icon: UsersRound },
  { href: "/recruiter/jobs", label: "Jobs", icon: BriefcaseBusiness },
  { href: "/recruiter/interviews", label: "Interviews", icon: CalendarDays },
  { href: "/recruiter/messages", label: "Messages", icon: MessageSquareText },
  { href: "/recruiter/ai", label: "AI Assistant", icon: Sparkles },
] as const;

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { user, unreadThreads } = useWorkspace();
  const { signOut, signingOut } = useSignOut();

  return (
    <div className="flex h-full flex-col px-3 pt-5 pb-4">
      <Link
        href="/recruiter/candidates"
        onClick={onNavigate}
        aria-label="Encord recruiting home"
        className="mb-7 flex w-fit items-center rounded-md px-2.5"
      >
        <EncordLogo />
      </Link>

      <nav aria-label="Primary" className="flex flex-col gap-0.5">
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

      <div className="mt-auto flex flex-col gap-3 pt-6">
        <SidebarNavItem
          href="/recruiter/settings"
          label="Settings"
          icon={Settings}
          active={pathname.startsWith("/recruiter/settings")}
          onNavigate={onNavigate}
        />
        <DropdownMenu>
          <DropdownMenuTrigger className="flex w-full items-center gap-2.5 rounded-[8px] border-t border-border px-1.5 pt-3 pb-0.5 text-left transition-colors hover:text-ink">
            <Avatar name={user.name} src={user.avatarUrl} size={30} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-ink">{user.name}</span>
              <span className="block truncate text-xs text-stone">{user.title}</span>
            </span>
            <ChevronsUpDown aria-hidden className="size-4 shrink-0 text-stone" />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-[212px]">
            <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
            <DropdownMenuItem asChild>
              <Link href="/recruiter/settings" onClick={onNavigate}>
                <Settings /> Profile and settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={signingOut} onSelect={() => void signOut()}>
              <LogOut /> {signingOut ? "Signing out…" : "Sign out"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
