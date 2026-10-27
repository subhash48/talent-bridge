"use client";

import { BriefcaseBusiness, House, LogOut, MessageCircle, Settings, Users, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { useWorkspace } from "@/components/recruiter/WorkspaceProvider";
import { Avatar } from "@/components/shared/Avatar";
import { KavuntraLogo } from "@/components/shared/KavuntraLogo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import { ToastProvider } from "@/components/ui/Toaster";
import { useSignOut } from "@/hooks/useSignOut";
import { cn } from "@/lib/utils";

export const HIRE_NAV: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/hire", label: "Home", icon: House },
  { href: "/hire/jobs", label: "Jobs", icon: BriefcaseBusiness },
  { href: "/hire/applicants", label: "Applicants", icon: Users },
  { href: "/hire/messages", label: "Messages", icon: MessageCircle },
];

function isActive(pathname: string, href: string): boolean {
  return href === "/hire" ? pathname === "/hire" : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Simple Hire's frame: four places (Home, Jobs, Applicants, Messages), large and few. Across the top on wider
 * screens and along the bottom on phones, where a thumb reaches them.
 */
export function HireShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, unreadThreads } = useWorkspace();
  const { signOut, signingOut } = useSignOut();
  const business = user.workspace?.name ?? user.organization;

  const badge = (href: string) =>
    href === "/hire/messages" && unreadThreads > 0 ? (
      <span className="ml-1 rounded-full bg-highlight px-1.5 text-[11px] leading-5 font-semibold text-on-highlight">
        {unreadThreads}
        <span className="sr-only"> unread</span>
      </span>
    ) : null;

  return (
    <ToastProvider>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[70] focus:rounded-[10px] focus:bg-brand focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-on-brand"
      >
        Skip to content
      </a>
      <div className="relative isolate flex min-h-dvh flex-col">
        <header className="sticky top-0 z-30 px-3 pt-3 sm:px-5 sm:pt-4">
          <div className="mx-auto flex h-14 w-full max-w-[1040px] items-center gap-4 rounded-full bg-overlay/75 pr-2 pl-4 shadow-soft ring-1 ring-ink/[0.07] backdrop-blur-xl sm:pl-5">
            <Link href="/hire" className="flex min-w-0 items-center gap-3 rounded-full" aria-label="Simple Hire home">
              <KavuntraLogo />
              <span className="hidden truncate border-l border-border pl-3 text-sm font-medium text-charcoal sm:block">
                {business}
              </span>
            </Link>
            <nav aria-label="Simple Hire" className="ml-auto hidden items-center gap-1 md:flex">
              {HIRE_NAV.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  aria-current={isActive(pathname, href) ? "page" : undefined}
                  className={cn(
                    "inline-flex h-10 items-center gap-2 rounded-full px-4 text-[15px] font-medium transition-colors duration-200",
                    isActive(pathname, href) ? "bg-brand text-on-brand" : "text-charcoal hover:bg-ink/[0.05] hover:text-ink",
                  )}
                >
                  <Icon aria-hidden className="size-[18px]" />
                  {label}
                  {badge(href)}
                </Link>
              ))}
            </nav>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="ml-auto rounded-full md:ml-2" aria-label="Your account">
                  <Avatar name={user.name} src={user.avatarUrl} size={36} className="rounded-full ring-1 ring-ink/10" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>
                  <span className="block text-sm text-ink">{user.name}</span>
                  <span className="block text-xs font-normal text-stone">{business}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/hire/settings">
                    <Settings aria-hidden /> Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem disabled={signingOut} onSelect={() => void signOut()}>
                  <LogOut aria-hidden /> {signingOut ? "Signing out…" : "Sign out"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main id="main" tabIndex={-1} className="app-backdrop relative flex-1 pb-28 focus:outline-none md:pb-16">
          <div className="mx-auto w-full max-w-[1040px] px-4 pt-8 sm:px-6 sm:pt-12">{children}</div>
        </main>
        <nav
          aria-label="Simple Hire"
          className="fixed inset-x-0 bottom-0 z-30 border-t border-border/70 bg-overlay/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
        >
          <ul className="grid grid-cols-4">
            {HIRE_NAV.map(({ href, label, icon: Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={isActive(pathname, href) ? "page" : undefined}
                  className={cn(
                    "flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium",
                    isActive(pathname, href) ? "text-brand-ink" : "text-stone",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-7 w-12 items-center justify-center rounded-full",
                      isActive(pathname, href) && "bg-brand text-on-brand",
                    )}
                  >
                    <Icon aria-hidden className="size-[18px]" />
                  </span>
                  <span className="flex items-center">
                    {label}
                    {badge(href)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </ToastProvider>
  );
}
