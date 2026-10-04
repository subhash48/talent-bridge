"use client";

import { CloudOff, Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

import { useCandidatePortal } from "@/components/candidate/CandidatePortalProvider";
import { CandidateSidebarContent } from "@/components/candidate/CandidateSidebar";
import { CandidateTopActions } from "@/components/candidate/CandidateTopActions";
import { EncordLogo } from "@/components/shared/EncordLogo";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { ToastProvider } from "@/components/ui/Toaster";
import { cn } from "@/lib/utils";

// Same frame as the recruiter workspace, calmer inside: sidebar on desktop, a sheet below lg.
export function CandidateShell({ children }: { children: ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);
  const { offline } = useCandidatePortal();
  // The dashboard shows the bell and avatar itself, beside its game's score. Its top bar is then
  // only the menu button and logo, which a wide screen has in the sidebar.
  const dashboard = usePathname() === "/candidate";

  return (
    <ToastProvider>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[70] focus:rounded-[10px] focus:bg-ink focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-canvas"
      >
        Skip to content
      </a>
      <div className="flex min-h-dvh">
        <aside className="sticky top-0 hidden h-dvh w-[244px] shrink-0 overflow-y-auto border-r border-border bg-surface/80 lg:block">
          <CandidateSidebarContent />
        </aside>
        <Sheet open={navOpen} onOpenChange={setNavOpen} side="left" title="Navigation">
          <CandidateSidebarContent onNavigate={() => setNavOpen(false)} />
        </Sheet>

        <div className="relative flex min-w-0 flex-1 flex-col">
          <div aria-hidden className="app-backdrop pointer-events-none absolute inset-x-0 top-0 h-[520px]" />
          <header
            className={cn(
              "relative flex h-[72px] shrink-0 items-center justify-between gap-3 px-4 sm:px-6 lg:justify-end lg:px-10",
              dashboard && "lg:hidden",
            )}
          >
            <div className="flex items-center gap-1 lg:hidden">
              <Button variant="ghost" size="icon" onClick={() => setNavOpen(true)} aria-label="Open navigation">
                <Menu />
              </Button>
              <Link href="/candidate" aria-label="Candidate portal home" className="rounded-md px-1">
                <EncordLogo />
              </Link>
            </div>
            {!dashboard && <CandidateTopActions />}
          </header>
          {offline && (
            <p
              role="status"
              className={cn(
                "relative mx-4 mb-2 flex items-center gap-2 rounded-[12px] border border-amber-300/20 bg-amber-400/10 px-3.5 py-2.5 text-sm text-amber-100 sm:mx-6 lg:mx-10",
                dashboard && "lg:mt-4",
              )}
            >
              <CloudOff aria-hidden className="size-4 shrink-0" />
              We can’t reach the server right now. You’re seeing the latest information we have.
            </p>
          )}
          <main id="main" tabIndex={-1} className="relative mx-auto w-full max-w-[1180px] flex-1 px-4 pb-14 focus:outline-none sm:px-6 lg:px-10">
            {children}
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
