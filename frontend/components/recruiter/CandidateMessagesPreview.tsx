import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { MessageBubble } from "@/components/recruiter/MessageBubble";
import { firstName } from "@/lib/format";
import type { PipelineCandidate, ThreadMessage } from "@/types/workspace";

const PREVIEW_COUNT = 3;

export function CandidateMessagesPreview({ candidate, messages }: { candidate: PipelineCandidate; messages: ThreadMessage[] }) {
  const href = `/recruiter/messages?candidate=${candidate.id}`;
  const linkClass = "inline-flex items-center gap-1.5 rounded-sm text-sm text-charcoal transition-colors hover:text-ink";

  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <p className="text-sm text-stone">No messages with {firstName(candidate.name)} yet.</p>
        <Link href={href} className={linkClass}>
          Start a conversation <ArrowRight aria-hidden className="size-4" />
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3.5">
      {messages.slice(-PREVIEW_COUNT).map((message) => (
        <MessageBubble key={message.id} message={message} authorName={candidate.name} />
      ))}
      <Link href={href} className={`${linkClass} self-start`}>
        Open conversation <ArrowRight aria-hidden className="size-4" />
      </Link>
    </div>
  );
}
