"use client";

import {
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  ChevronsUpDown,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  MessageSquareText,
  Sparkles,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import { useSignOut } from "@/hooks/useSignOut";

// Each page and the addresses that belong to it: one application lives under Applications, and
// interview prep (opened from Interviews and the dashboard's next step) under Interviews.
const NAV = [
  { href: "/candidate", label: "Dashboard", icon: LayoutDashboard, matches: [] },
  { href: "/candidate/applications", label: "Applications", icon: BriefcaseBusiness, matches: ["/candidate/application"] },
  { href: "/candidate/interviews", label: "Interviews", icon: CalendarDays, matches: ["/candidate/prep"] },
  { href: "/candidate/messages", label: "Messages", icon: MessageSquareText, matches: [] },
  { href: "/candidate/company", label: "Company", icon: Building2, matches: [] },
  { href: "/candidate/ai", label: "Ask AI", icon: Sparkles, matches: [] },
  { href: "/candidate/profile", label: "Profile", icon: UserRound, matches: [] },
] as const;

function isActive(pathname: string, { href, matches }: (typeof NAV)[number]): boolean {
  if (href === "/candidate") return pathname === href;
  return [href, ...matches].some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function CandidateSidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { me } = useCandidatePortal();
  const [helpOpen, setHelpOpen] = useState(false);
  const { signOut, signingOut } = useSignOut();
  const unread = me.unreadMessages;

  return (
    <div className="flex h-full flex-col px-3 pt-5 pb-4">
      <Link href="/candidate" onClick={onNavigate} aria-label="Candidate portal home" className="mb-1.5 flex w-fit items-center rounded-md px-2.5">
        <EncordLogo />
      </Link>
      <p className={me.applications.length > 1 ? "mb-3 px-2.5 text-xs text-faint" : "mb-6 px-2.5 text-xs text-faint"}>Candidate portal</p>
      {me.applications.length > 1 && <ApplicationSwitcher onNavigate={onNavigate} />}

      <nav aria-label="Candidate portal" className="flex flex-col gap-0.5">
        {NAV.map((item) => (
          <SidebarNavItem
            key={item.href}
            href={item.href}
            label={item.label}
            icon={item.icon}
            active={isActive(pathname, item)}
            badge={item.href === "/candidate/messages" ? { count: unread, label: `${unread} unread message${unread === 1 ? "" : "s"}` } : undefined}
            onNavigate={onNavigate}
          />
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-3 pt-6">
        <button
          type="button"
          onClick={() => setHelpOpen(true)}
          className="flex h-9 items-center gap-2.5 rounded-[8px] px-2.5 text-sm text-stone transition-[background-color,color] duration-200 hover:bg-ink/[0.04] hover:text-ink"
        >
          <LifeBuoy aria-hidden strokeWidth={1.75} className="size-[17px]" />
          Help
        </button>
        <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} onNavigate={onNavigate} />

        <DropdownMenu>
          <DropdownMenuTrigger className="flex w-full items-center gap-2.5 rounded-[8px] border-t border-border px-1.5 pt-3 pb-0.5 text-left transition-colors hover:text-ink">
            <Avatar name={me.candidate.fullName} src={me.candidate.avatarUrl} size={30} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-ink">{me.candidate.fullName}</span>
              <span className="block truncate text-xs text-stone">{me.candidate.email}</span>
            </span>
            <ChevronsUpDown aria-hidden className="size-4 shrink-0 text-stone" />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-[212px]">
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

/** Which application the portal shows. Interviews, messages and prep all follow the choice. */
function ApplicationSwitcher({ onNavigate }: { onNavigate?: () => void }) {
  const { me, applicationId, selectApplication } = useCandidatePortal();
  const pathname = usePathname();
  const router = useRouter();
  const current = me.applications.find((application) => application.id === applicationId);

  function choose(id: string) {
    selectApplication(id);
    if (pathname.startsWith("/candidate/application/")) router.push(`/candidate/application/${id}`);
    onNavigate?.();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="mb-4 flex w-full items-center gap-2 rounded-[8px] bg-ink/[0.04] px-2.5 py-2 text-left ring-1 ring-ink/[0.08] transition-colors hover:bg-ink/[0.07]">
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] text-faint">Viewing application</span>
          <span className="block truncate text-[13px] font-medium text-ink">{current?.jobTitle ?? "Choose an application"}</span>
        </span>
        <ChevronsUpDown aria-hidden className="size-4 shrink-0 text-stone" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[260px]">
        <DropdownMenuLabel>Your applications</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={applicationId ?? ""} onValueChange={choose}>
          {me.applications.map((application) => (
            <DropdownMenuRadioItem key={application.id} value={application.id} className="items-start py-2">
              <span className="min-w-0">
                <span className="block truncate">{application.jobTitle}</span>
                <span className="block text-xs text-stone">{application.stageLabel}</span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
