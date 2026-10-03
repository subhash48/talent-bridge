"use client";

import Link from "next/link";

import { useCandidatePortal } from "@/components/candidate/CandidatePortalProvider";
import { buttonStyles } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { firstName } from "@/lib/format";

const FAQ = [
  {
    question: "How do I confirm an interview?",
    answer: "Open Interviews and press Confirm. Your recruiter sees it straight away.",
  },
  {
    question: "What if I need to reschedule?",
    answer: "Send your recruiter a message with a few times that work for you.",
  },
  {
    question: "Who sees what I ask the AI assistant?",
    answer: "Your recruiter sees the topic you asked about, such as interview preparation, never your question or the answer.",
  },
  {
    question: "Can the assistant tell me how my interviews went?",
    answer: "No. It only sees what you see in this portal, never the team's internal feedback or decisions.",
  },
];

export function HelpDialog({ open, onClose, onNavigate }: { open: boolean; onClose: () => void; onNavigate?: () => void }) {
  const { me } = useCandidatePortal();
  const recruiter = me.recruiter ? firstName(me.recruiter.name) : "your recruiter";

  return (
    <Modal open={open} onClose={onClose} title="Help" description="Answers to common questions about the candidate portal.">
      <dl className="flex flex-col gap-4">
        {FAQ.map((item) => (
          <div key={item.question}>
            <dt className="text-sm font-medium text-ink">{item.question}</dt>
            <dd className="mt-1 text-sm leading-relaxed text-stone">{item.answer}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-6 flex justify-end">
        <Link
          href="/candidate/messages"
          onClick={() => {
            onClose();
            onNavigate?.();
          }}
          className={buttonStyles({ variant: "secondary" })}
        >
          Message {recruiter}
        </Link>
      </div>
    </Modal>
  );
}
