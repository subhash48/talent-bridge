"use client";

import {
  BookOpenCheck,
  BriefcaseBusiness,
  CalendarDays,
  ChevronsUpDown,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  MessageSquareText,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { HelpDialog } from "@/components/candidate/HelpDialog";
import { useCandidatePortal } from "@/components/candidate/CandidatePortalProvider";
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
  { href: "/candidate", label: "Dashboard", icon: LayoutDashboard },
  { href: "/candidate/application", label: "My Application", icon: BriefcaseBusiness },
  { href: "/candidate/interviews", label: "Interviews", icon: CalendarDays },
  { href: "/candidate/messages", label: "Messages", icon: MessageSquareText },
  { href: "/candidate/prep", label: "Interview Prep", icon: BookOpenCheck },
  { href: "/candidate/profile", label: "Profile", icon: UserRound },
] as const;

export function CandidateSidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { me } = useCandidatePortal();
  const [helpOpen, setHelpOpen] = useState(false);
  const { signOut, signingOut } = useSignOut();
  const unread = me.unreadMessages;

  return (
    <div className="flex h-full flex-col px-4 pt-7 pb-5">
      <Link href="/candidate" onClick={onNavigate} aria-label="Candidate portal home" className="mb-2 flex w-fit items-center rounded-md px-3">
        <EncordLogo />
      </Link>
      <p className="mb-8 px-3 text-[13px] text-faint">Candidate portal</p>

      <nav aria-label="Candidate portal" className="flex flex-col gap-1">
        {NAV.map((item) => (
          <SidebarNavItem
            key={item.href}
            {...item}
            active={item.href === "/candidate" ? pathname === item.href : pathname.startsWith(item.href)}
            badge={item.href === "/candidate/messages" ? { count: unread, label: `${unread} unread message${unread === 1 ? "" : "s"}` } : undefined}
            onNavigate={onNavigate}
          />
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-4 pt-8">
        <button
          type="button"
          onClick={() => setHelpOpen(true)}
          className="flex h-11 items-center gap-3 rounded-[12px] px-3 text-[15px] text-stone transition-[background-color,color] duration-200 hover:bg-white/[0.04] hover:text-ink"
        >
          <LifeBuoy aria-hidden strokeWidth={1.75} className="size-[19px]" />
          Help
        </button>
        <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} onNavigate={onNavigate} />

        <DropdownMenu>
          <DropdownMenuTrigger className="flex w-full items-center gap-3 rounded-[12px] border-t border-border px-2 pt-4 pb-1 text-left transition-colors hover:text-ink">
            <Avatar name={me.candidate.fullName} src={me.candidate.avatarUrl} size={36} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-medium text-ink">{me.candidate.fullName}</span>
              <span className="block truncate text-[13px] text-stone">{me.job?.title ?? "Candidate"}</span>
            </span>
            <ChevronsUpDown aria-hidden className="size-4 shrink-0 text-stone" />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-[230px]">
            <DropdownMenuLabel>{me.candidate.email}</DropdownMenuLabel>
            <DropdownMenuItem asChild>
              <Link href="/candidate/profile" onClick={onNavigate}>
                <UserRound /> Your profile
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
