"use client";

import { CircleCheck, CircleDashed, LoaderCircle, Send } from "lucide-react";
import { useState } from "react";

import { useWorkspace } from "@/components/recruiter/WorkspaceProvider";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toaster";
import { errorMessage, USE_MOCK_API } from "@/services/api";
import { inviteToPortal } from "@/services/portal-access";
import type { PortalAccessStatus, PipelineCandidate } from "@/types/workspace";

const LABELS: Record<PortalAccessStatus, string> = {
  active: "Signed in",
  invited: "Invited, not signed in yet",
  pending_invitation: "Invitation waiting to go out",
  invite_failed: "Invitation failed",
  not_required: "Not invited",
};

/** Whether the candidate can read updates in their portal, and a way to invite them (or try again). */
export function PortalAccessRow({ candidate }: { candidate: PipelineCandidate }) {
  const { refresh } = useWorkspace();
  const toast = useToast();
  const [status, setStatus] = useState<PortalAccessStatus>(candidate.portalStatus ?? "not_required");
  const [sending, setSending] = useState(false);

  async function invite() {
    setSending(true);
    try {
      const access = await inviteToPortal(candidate.candidateId);
      setStatus(access.status);
      if (access.status === "invite_failed") {
        toast({ title: "Invitation not sent", description: access.problem ?? "Try again in a moment.", tone: "error" });
      } else {
        toast({ title: `Portal invitation sent to ${candidate.email ?? candidate.name}`, tone: "success" });
      }
      refresh().catch(() => undefined);
    } catch (caught) {
      toast({ title: "Invitation not sent", description: errorMessage(caught, "Try again in a moment."), tone: "error" });
    } finally {
      setSending(false);
    }
  }

  const done = status === "active";
  const canInvite = !done && !USE_MOCK_API;
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2 last:pb-0">
      <dt className="text-xs text-stone">Candidate portal</dt>
      <dd className="flex flex-wrap items-center gap-x-2 text-right text-[13px]">
        <span className={done ? "inline-flex items-center gap-1 text-sage" : "inline-flex items-center gap-1 text-caution"}>
          {done ? <CircleCheck aria-hidden className="size-3.5" /> : <CircleDashed aria-hidden className="size-3.5" />}
          {LABELS[status]}
        </span>
        {canInvite && (
          <Button variant="secondary" size="sm" onClick={() => void invite()} disabled={sending}>
            {sending ? <LoaderCircle className="animate-spin" /> : <Send />}
            {status === "not_required" ? "Invite" : "Resend"}
          </Button>
        )}
      </dd>
    </div>
  );
}
