"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const NAV = [
  { href: "/candidate", label: "Home" },
  { href: "/candidate/application", label: "My application" },
  { href: "/candidate/interviews", label: "Interviews" },
  { href: "/candidate/messages", label: "Messages" },
  { href: "/candidate/company", label: "Company" },
  { href: "/candidate/resources", label: "Resources" },
  { href: "/candidate/ai", label: "AI Assistant" },
] as const;

export function CandidateSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-60 shrink-0 border-r border-border bg-surface px-4 py-8">
      <p className="px-3 font-display text-2xl text-ink">HireMesh</p>
      <nav className="mt-8 flex flex-col gap-1">
        {NAV.map((item) => {
          const active =
            item.href === "/candidate" ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-[10px] px-3 py-2 text-sm text-stone transition-colors hover:bg-muted hover:text-ink",
                active && "bg-surface-raised text-ink shadow-soft",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
