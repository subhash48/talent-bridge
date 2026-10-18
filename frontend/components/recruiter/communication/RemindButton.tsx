"use client";

import { BellRing } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { DraftPanel } from "@/components/recruiter/communication/DraftPanel";
import { useWorkspace } from "@/components/recruiter/WorkspaceProvider";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { firstName } from "@/lib/format";
import type { CandidateRef } from "@/types/workspace";

/** Draft a reminder to confirm an interview, for the recruiter to edit and send. */
export function RemindButton({ candidate, interviewTitle }: { candidate: CandidateRef; interviewTitle: string }) {
  const { emailConfigured, refresh } = useWorkspace();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const first = firstName(candidate.name);
  return (
    <>
      <Button variant="ai" size="sm" onClick={() => setOpen(true)}>
        <BellRing /> Remind
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Remind ${first} to confirm`}
        description={`${interviewTitle}. The AI drafts the reminder; nothing is sent until you approve it.`}
        className="sm:max-w-xl"
      >
        {open && (
          <DraftPanel
            applicationId={candidate.id}
            firstName={first}
            reason="interview_unconfirmed"
            emailConfigured={emailConfigured}
            onSent={() =>
              window.setTimeout(() => {
                setOpen(false);
                refresh().catch(() => undefined);
                router.refresh();
              }, 1200)
            }
            onClose={() => setOpen(false)}
          />
        )}
      </Modal>
    </>
  );
}
