import { CircleCheck, Inbox, Mail } from "lucide-react";

import { Card } from "@/components/ui/Card";
import type { EmailDeliveryStatus } from "@/types/communication";

/** Whether approved messages are also emailed, and how to turn it on. */
export function EmailDeliveryCard({ status }: { status: EmailDeliveryStatus | null }) {
  return (
    <Card id="email" className="scroll-mt-6">
      <h2 className="flex items-center gap-2 text-sm font-medium text-stone">
        <Mail aria-hidden className="size-4" /> Email delivery
      </h2>
      {status?.configured ? (
        <>
          <p className="mt-3.5 flex items-center gap-2 text-sm font-medium text-sage">
            <CircleCheck aria-hidden className="size-4" /> On
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-stone">
            Every message you approve reaches the candidate&apos;s portal and is emailed from{" "}
            <span className="text-charcoal">{status.sender}</span> via {status.provider === "resend" ? "Resend" : status.provider}.
            Each message shows whether its email went out.
          </p>
        </>
      ) : (
        <>
          <p className="mt-3.5 flex items-center gap-2 text-sm font-medium text-caution">
            <Inbox aria-hidden className="size-4" /> Portal only
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-stone">
            Approved messages reach the candidate portal, and candidates get nothing in their inbox. To email them too, set
            these in <code className="text-charcoal">backend/.env</code> and restart the API:
          </p>
          <pre className="mt-3 overflow-x-auto rounded-[8px] bg-ink/[0.04] p-3 text-xs leading-relaxed text-charcoal ring-1 ring-ink/10">
            {"RESEND_API_KEY=re_...\nEMAIL_FROM=Kavuntra <updates@yourcompany.com>"}
          </pre>
          <p className="mt-2 text-xs text-faint">The sender&apos;s domain must be verified in Resend.</p>
        </>
      )}
    </Card>
  );
}
