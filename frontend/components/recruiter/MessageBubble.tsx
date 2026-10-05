import { RelativeTime } from "@/components/shared/RelativeTime";
import { cn } from "@/lib/utils";
import type { ThreadMessage } from "@/types/workspace";

/** Recruiter messages sit on the right, candidate messages on the left. */
export function MessageBubble({ message, authorName }: { message: ThreadMessage; authorName: string }) {
  const outgoing = message.author === "recruiter";
  return (
    <div className={cn("flex flex-col gap-1", outgoing ? "items-end" : "items-start")}>
      <p
        className={cn(
          "max-w-[85%] rounded-[12px] px-3.5 py-2 text-sm leading-relaxed whitespace-pre-line",
          outgoing ? "rounded-br-[5px] bg-ink/[0.1] text-ink" : "rounded-bl-[5px] bg-ink/[0.04] text-charcoal ring-1 ring-ink/[0.07]",
        )}
      >
        <span className="sr-only">{outgoing ? "You" : authorName}: </span>
        {message.body}
      </p>
      <RelativeTime iso={message.sentAt} className="px-1 text-xs text-faint" />
    </div>
  );
}
