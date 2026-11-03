"use client";

import { ArrowRight, Store, UserRound, Users, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { Modal } from "@/components/ui/Modal";
import { INTENT_PATHS, type Intent } from "@/lib/intent";

/** The three people Hirvello is for, each with where their answer leads. */
const CHOICES: { intent: Intent; label: string; text: string; icon: LucideIcon }[] = [
  { intent: "recruiter", label: "I'm a recruiter", text: "Sign in to your company's hiring workspace.", icon: Users },
  { intent: "small_business", label: "I own a small business", text: "Start hiring with Simple Hire.", icon: Store },
  { intent: "candidate", label: "I'm looking for a job", text: "Sign in to your candidate portal.", icon: UserRound },
];

/**
 * Asked once, after a request the concierge can't place: which of the three is you. Each answer is a link to that
 * flow, so choosing is leaving. Escape, the close button or a click outside put it away.
 */
export function RoleChoice({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Which of these is you?"
      description="We couldn't tell from that alone. Pick one and we'll take you there."
      className="max-w-[420px] text-left"
    >
      <ul className="flex flex-col gap-2">
        {CHOICES.map(({ intent, label, text, icon: Icon }) => (
          <li key={intent}>
            <Link
              href={INTENT_PATHS[intent]}
              className="group flex items-center gap-3.5 rounded-[14px] border border-border/70 bg-glass-strong px-3.5 py-3 transition-[border-color,background-color] duration-200 hover:border-accent/40 hover:bg-overlay"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-accent-soft text-brand-ink ring-1 ring-accent/10">
                <Icon aria-hidden className="size-[18px]" strokeWidth={1.75} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold text-ink">{label}</span>
                <span className="mt-0.5 block text-[13px] text-stone">{text}</span>
              </span>
              <ArrowRight
                aria-hidden
                className="size-4 shrink-0 text-faint transition-[transform,color] duration-200 group-hover:translate-x-0.5 group-hover:text-brand-ink"
              />
            </Link>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
