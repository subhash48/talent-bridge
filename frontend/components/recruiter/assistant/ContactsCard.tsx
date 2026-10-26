import { Mail, Phone, PhoneOff } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ContactCard } from "@/types/assistant";

/**
 * The contact details applicants gave when they applied: name, phone number and the role they applied for,
 * for the applicants picked only. Someone who gave no phone number shows that, never a number from anywhere
 * else. large: Simple Hire's bigger type.
 */
export function ContactsCard({ card, large = false }: { card: ContactCard; large?: boolean }) {
  return (
    <div className="mt-3 rounded-[12px] border border-border bg-surface-raised">
      <ul className="divide-y divide-border">
        {card.items.map((item) => (
          <li
            key={item.application_id}
            className={cn("flex flex-wrap items-center gap-x-4 gap-y-1", large ? "p-4" : "px-3.5 py-3")}
          >
            <div className="min-w-0 flex-1">
              <p className={cn("font-semibold text-ink", large ? "text-base" : "text-sm")}>{item.name}</p>
              <p className="text-xs text-stone">Applied for {item.job_title}</p>
            </div>
            {item.phone ? (
              <a
                href={`tel:${item.phone.replace(/[^\d+]/g, "")}`}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-[8px] font-medium text-brand-ink tabular-nums underline-offset-4 hover:underline",
                  large ? "text-base" : "text-sm",
                )}
              >
                <Phone aria-hidden className="size-4" />
                {item.phone}
              </a>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-sm text-faint">
                <PhoneOff aria-hidden className="size-4" />
                No phone number given
              </span>
            )}
            <a
              href={`mailto:${item.email}`}
              className="inline-flex items-center gap-1.5 text-xs text-stone underline-offset-4 hover:text-ink hover:underline"
            >
              <Mail aria-hidden className="size-3.5" />
              {item.email}
            </a>
          </li>
        ))}
      </ul>
      <p className="border-t border-border px-3.5 py-2.5 text-xs text-faint">{card.note}</p>
    </div>
  );
}
