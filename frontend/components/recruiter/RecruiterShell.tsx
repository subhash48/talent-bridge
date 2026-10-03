"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";

import { NotificationsMenu } from "@/components/recruiter/NotificationsMenu";
import { SidebarContent } from "@/components/recruiter/RecruiterSidebar";
import { useWorkspace } from "@/components/recruiter/WorkspaceProvider";
import { Avatar } from "@/components/shared/Avatar";
import { EncordLogo } from "@/components/shared/EncordLogo";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { ToastProvider } from "@/components/ui/Toaster";

// Sidebar on desktop, a slide-in sheet below lg. The top of the workspace stays dark with a soft glow.
export function RecruiterShell({ children }: { children: ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);
  const { user } = useWorkspace();

  return (
    <ToastProvider>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[70] focus:rounded-[10px] focus:bg-ink focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-canvas"
      >
        Skip to content
      </a>
      <div className="flex min-h-dvh">
        <aside className="sticky top-0 hidden h-dvh w-[220px] shrink-0 border-r border-border bg-surface/80 lg:block">
          <SidebarContent />
        </aside>
        <Sheet open={navOpen} onOpenChange={setNavOpen} side="left" title="Navigation">
          <SidebarContent onNavigate={() => setNavOpen(false)} />
        </Sheet>

        <div className="relative flex min-w-0 flex-1 flex-col">
          <div aria-hidden className="app-backdrop pointer-events-none absolute inset-x-0 top-0 h-[560px]" />
          <header className="relative flex h-[72px] shrink-0 items-center justify-between gap-3 px-4 sm:px-6 lg:justify-end lg:px-8">
            <div className="flex items-center gap-1 lg:hidden">
              <Button variant="ghost" size="icon" onClick={() => setNavOpen(true)} aria-label="Open navigation">
                <Menu />
              </Button>
              <Link href="/recruiter/candidates" aria-label="Encord recruiting home" className="rounded-md px-1">
                <EncordLogo />
              </Link>
            </div>
            <div className="flex items-center gap-2">
              <NotificationsMenu />
              <Link href="/recruiter/settings" aria-label="Your profile and settings" className="rounded-full">
                <Avatar name={user.name} src={user.avatarUrl} size={40} className="ring-2 ring-white/10 rounded-full" />
              </Link>
            </div>
          </header>
          <main id="main" tabIndex={-1} className="relative flex-1 px-4 pb-12 focus:outline-none sm:px-6 lg:px-8">
            {children}
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
