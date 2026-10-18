import { ArrowRight, MessageSquareText } from "lucide-react";
import Link from "next/link";

import { Avatar } from "@/components/shared/Avatar";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { buttonStyles } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { CandidateMeResponse } from "@/types/portal";

/** The last update from the hiring team: their latest message, and when it came. */
export function LastUpdateCard({ me }: { me: CandidateMeResponse }) {
  const message = me.latestMessage;
  const recruiter = me.recruiter?.name;
  return (
    <Card className="flex flex-col p-5 sm:p-5">
      <h2 className="flex items-center gap-2 text-xs font-medium text-stone">
        <MessageSquareText aria-hidden className="size-4" /> Last update from the team
      </h2>
      {message ? (
        <div className="mt-3 flex gap-3">
          <Avatar name={message.senderName} size={32} />
          <div className="min-w-0 flex-1">
            <p className="flex items-baseline justify-between gap-2 text-[13px]">
              <span className="truncate font-medium text-charcoal">{message.senderName}</span>
              <RelativeTime iso={message.sentAt} className="shrink-0 text-xs text-faint" />
            </p>
            <p className="mt-0.5 line-clamp-3 text-sm whitespace-pre-line text-charcoal">{message.body}</p>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-sm text-stone">
          No message yet. {recruiter ? `${recruiter} will` : "The hiring team will"} keep you updated here.
        </p>
      )}
      <div className="mt-auto pt-5">
        <Link href="/candidate/messages" className={buttonStyles({ variant: "secondary", size: "sm" })}>
          {message ? "Open messages" : "Message the team"} <ArrowRight />
        </Link>
      </div>
    </Card>
  );
}
