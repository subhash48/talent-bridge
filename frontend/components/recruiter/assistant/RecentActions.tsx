import { Check, Mic, X } from "lucide-react";
import Link from "next/link";

import { formatDayLabel, formatTime } from "@/lib/format";
import type { AssistantHistoryItem } from "@/types/assistant";

/** What the assistant has done for you: messages sent, jobs drafted and published, and any failures. */
export function RecentActions({ items }: { items: AssistantHistoryItem[] }) {
  if (items.length === 0) {
    return <p className="text-xs leading-relaxed text-faint">Messages you send and jobs you create or publish here will be listed.</p>;
  }
  const groups = new Map<string, AssistantHistoryItem[]>();
  for (const item of items) {
    const day = formatDayLabel(item.executed_at ?? item.created_at, { long: true });
    groups.set(day, [...(groups.get(day) ?? []), item]);
  }
  return (
    <div className="flex flex-col gap-3" suppressHydrationWarning>
      {[...groups].map(([day, entries]) => (
        <div key={day}>
          <p className="text-[11px] font-medium tracking-wide text-faint uppercase">{day}</p>
          <ul className="mt-1.5 flex flex-col gap-1.5">
            {entries.map((item) => {
              const failed = item.status === "failed";
              const content = (
                <>
                  {failed ? (
                    <X aria-hidden className="mt-0.5 size-3.5 shrink-0 text-danger" />
                  ) : (
                    <Check aria-hidden className="mt-0.5 size-3.5 shrink-0 text-sage" strokeWidth={2.5} />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] leading-snug text-charcoal">{item.summary}</span>
                    <span className="mt-0.5 flex items-center gap-1 text-[11px] text-faint">
                      {formatTime(item.executed_at ?? item.created_at)}
                      {item.input_type === "voice" && (
                        <>
                          · <Mic aria-hidden className="size-3" /> <span>Voice</span>
                        </>
                      )}
                      {failed && <span className="sr-only">Failed</span>}
                    </span>
                  </span>
                </>
              );
              return (
                <li key={item.id}>
                  {item.href ? (
                    <Link href={item.href} className="flex gap-2 rounded-[8px] px-1 py-1 transition-colors hover:bg-ink/[0.04]">
                      {content}
                    </Link>
                  ) : (
                    <div className="flex gap-2 px-1 py-1">{content}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
