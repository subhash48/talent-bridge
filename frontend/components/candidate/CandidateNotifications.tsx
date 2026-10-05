"use client";

import { Bell, CalendarDays, MessageSquareText, Route, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { useCandidatePortal } from "@/components/candidate/CandidatePortalProvider";
import { Button } from "@/components/ui/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import { attentionKey, portalNotifications, type PortalNotification } from "@/lib/portal-notifications";
import { cn } from "@/lib/utils";

const ICONS: Record<PortalNotification["kind"], LucideIcon> = {
  message: MessageSquareText,
  interview: CalendarDays,
  stage: Route,
};

/** Derived from the candidate's own record: unread messages, the next interview and stage changes. */
export function CandidateNotifications() {
  const { me } = useCandidatePortal();
  const [seenKey, setSeenKey] = useState("");
  const key = attentionKey(me);
  const unseen = key !== "" && key !== seenKey;

  return (
    <DropdownMenu onOpenChange={(open) => open && setSeenKey(key)}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Notifications" className="relative rounded-full text-charcoal">
          <Bell strokeWidth={1.75} />
          {unseen && (
            <span className="absolute top-2 right-2 size-[7px] rounded-full bg-ink ring-2 ring-canvas">
              <span className="sr-only">New notifications</span>
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[320px]">
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        <NotificationItems />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Rendered only while the menu is open, so times are formatted in the browser.
function NotificationItems() {
  const { me } = useCandidatePortal();
  const items = portalNotifications(me);
  if (items.length === 0) return <p className="px-2.5 py-3 text-sm text-stone">You’re all caught up.</p>;

  return items.map((item) => {
    const Icon = ICONS[item.kind];
    return (
      <DropdownMenuItem key={item.id} asChild className="h-auto items-start py-2">
        <Link href={item.href}>
          <span
            className={cn(
              "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full ring-1",
              item.attention ? "bg-ai/15 ring-ai/30 [&_svg]:text-ink!" : "bg-ink/[0.05] ring-ink/10",
            )}
          >
            <Icon aria-hidden className="size-3.5!" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-ink">{item.title}</span>
            {item.description && <span className="mt-0.5 line-clamp-2 block text-xs text-stone">{item.description}</span>}
          </span>
        </Link>
      </DropdownMenuItem>
    );
  });
}
