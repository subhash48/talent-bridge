import { MessageSquareText } from "lucide-react";
import Link from "next/link";

import { Avatar } from "@/components/shared/Avatar";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { buttonStyles } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { pluralize } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CandidateMessage } from "@/types/portal";

export function MessagesCard({ unread, latest }: { unread: number; latest: CandidateMessage | null }) {
  return (
    <Card className="flex flex-col p-5 sm:p-6">
      <p className="flex items-center gap-2 text-[13px] font-medium text-stone">
        <MessageSquareText aria-hidden className="size-4" /> Messages
      </p>
      <h2 className={cn("mt-3 text-xl font-semibold tracking-tight", unread ? "text-ink" : "text-charcoal")}>
        {unread ? `${pluralize(unread, "unread message")}` : "No unread messages"}
      </h2>
      {latest ? (
        <div className="mt-4 flex gap-3">
          <Avatar name={latest.senderName} size={32} />
          <div className="min-w-0 flex-1">
            <p className="flex items-baseline justify-between gap-2 text-[13px]">
              <span className="truncate font-medium text-charcoal">{latest.senderName}</span>
              <RelativeTime iso={latest.sentAt} className="shrink-0 text-xs text-faint" />
            </p>
            <p className={cn("mt-0.5 line-clamp-2 text-sm", latest.readAt ? "text-stone" : "text-charcoal")}>{latest.body}</p>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-sm text-stone">No messages yet. Your recruiter’s messages will appear here.</p>
      )}
      <div className="mt-auto pt-6">
        <Link href="/candidate/messages" className={buttonStyles({ variant: "secondary", size: "sm" })}>
          View messages
        </Link>
      </div>
    </Card>
  );
}
