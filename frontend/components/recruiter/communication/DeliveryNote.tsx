import { CircleAlert, CircleCheck, Clock, Inbox } from "lucide-react";

import { cn } from "@/lib/utils";
import type { MessageDelivery } from "@/types/communication";

const NOTES = {
  sent: { icon: CircleCheck, tone: "text-sage", text: () => "Emailed and in their portal" },
  pending: { icon: Clock, tone: "text-stone", text: () => "In their portal · email sending" },
  failed: { icon: CircleAlert, tone: "text-danger", text: (error?: string) => `In their portal · email failed${error ? `: ${error}` : ""}` },
  not_configured: { icon: Inbox, tone: "text-caution", text: () => "In their portal only · email isn't set up" },
} as const;

/** Where a recruiter's message went: always the candidate portal, and email when it's configured. */
export function DeliveryNote({ delivery, className }: { delivery?: MessageDelivery; className?: string }) {
  if (!delivery) return null;
  const note = NOTES[delivery.emailStatus];
  const Icon = note.icon;
  return (
    <p className={cn("flex items-start gap-1.5 text-xs", note.tone, className)}>
      <Icon aria-hidden className="mt-px size-3.5 shrink-0" />
      <span>{note.text(delivery.error)}</span>
    </p>
  );
}
