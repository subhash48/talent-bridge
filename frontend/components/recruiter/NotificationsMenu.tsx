"use client";

import { Bell, CircleAlert } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { useWorkspace } from "@/components/recruiter/WorkspaceProvider";
import { Avatar } from "@/components/shared/Avatar";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { Button } from "@/components/ui/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";

/** Latest candidate activity, newest first. Follow-ups are flagged so they stand out. */
export function NotificationsMenu() {
  const { candidates } = useWorkspace();
  const [seen, setSeen] = useState(false);

  const recent = useMemo(
    () => [...candidates].sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt)).slice(0, 5),
    [candidates],
  );

  return (
    <DropdownMenu onOpenChange={(open) => open && setSeen(true)}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Notifications" className="relative rounded-full text-charcoal">
          <Bell strokeWidth={1.75} />
          {!seen && recent.length > 0 && (
            <span className="absolute top-2 right-2.5 size-2 rounded-full bg-ai ring-2 ring-canvas">
              <span className="sr-only">New activity</span>
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[340px]">
        <DropdownMenuLabel>Recent activity</DropdownMenuLabel>
        {recent.map((candidate) => (
          <DropdownMenuItem key={candidate.id} asChild className="h-auto items-start py-2.5">
            <Link href={`/recruiter/candidates?candidate=${candidate.id}`}>
              <Avatar name={candidate.name} src={candidate.avatarUrl} size={32} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-ink">
                  {candidate.name} <span className="text-stone">· {candidate.lastActivity.toLowerCase()}</span>
                </span>
                <span className="mt-0.5 flex items-center gap-1.5 text-xs text-faint">
                  <RelativeTime iso={candidate.lastActivityAt} />
                  {candidate.followUp && (
                    <span className="inline-flex items-center gap-1 text-amber-200">
                      <CircleAlert className="size-3! text-amber-200!" aria-hidden /> Needs follow-up
                    </span>
                  )}
                </span>
              </span>
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
