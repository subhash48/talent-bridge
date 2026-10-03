import { Check, CheckCheck } from "lucide-react";

import { Avatar } from "@/components/shared/Avatar";
import { formatDateTime, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CandidateMessage } from "@/types/portal";

/**
 * One message in the thread. Compact and document-like rather than chat bubbles: the hiring team's
 * messages sit on the left with their name, the candidate's own on the right with a faint violet tint.
 */
type MessageItemProps = {
  message: CandidateMessage;
  /** Follows a message from the same sender, so the name and avatar aren't repeated. */
  grouped: boolean;
  /** Shows whether the hiring team has read it; used on the candidate's latest message. */
  receipt?: boolean;
};

export function MessageItem({ message, grouped, receipt = false }: MessageItemProps) {
  const own = message.sender === "candidate";
  return (
    <div className={cn("flex gap-3", own ? "flex-row-reverse" : "flex-row", grouped ? "mt-1" : "mt-4")}>
      {own ? null : grouped ? <span aria-hidden className="w-8 shrink-0" /> : <Avatar name={message.senderName} size={32} />}
      <div className={cn("flex max-w-[85%] min-w-0 flex-col sm:max-w-[72%]", own ? "items-end" : "items-start")}>
        {!grouped && (
          <p className="mb-1 flex items-baseline gap-2 px-1 text-xs">
            <span className="font-medium text-charcoal">{own ? "You" : message.senderName}</span>
            <time dateTime={message.sentAt} title={formatDateTime(message.sentAt)} className="text-faint tabular-nums" suppressHydrationWarning>
              {formatTime(message.sentAt)}
            </time>
          </p>
        )}
        <p
          className={cn(
            "rounded-[14px] px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-line",
            own ? "bg-ai/[0.12] text-ink ring-1 ring-ai/20" : "bg-white/[0.04] text-charcoal ring-1 ring-white/[0.07]",
          )}
        >
          <span className="sr-only">{own ? "You" : message.senderName}: </span>
          {message.body}
        </p>
        {own && receipt && (
          <p className="mt-1 flex items-center gap-1 px-1 text-[11px] text-faint">
            {message.readAt ? <CheckCheck aria-hidden className="size-3.5 text-violet-200" /> : <Check aria-hidden className="size-3.5" />}
            {message.readAt ? "Read" : "Sent"}
          </p>
        )}
      </div>
    </div>
  );
}
