import { Inbox } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

/** Shown wherever messages are sent while email isn't configured: they still reach the portal. */
export function EmailNotice({ className }: { className?: string }) {
  return (
    <p
      role="note"
      className={cn(
        "flex items-start gap-2.5 rounded-[10px] border border-caution/30 bg-caution/[0.07] px-3.5 py-2.5 text-[13px] text-caution",
        className,
      )}
    >
      <Inbox aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>
        Email delivery isn&apos;t set up, so approved messages reach the candidate portal only.{" "}
        <Link href="/recruiter/settings#email" className="underline underline-offset-2 hover:text-ink">
          How to turn on email
        </Link>
      </span>
    </p>
  );
}
