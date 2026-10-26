"use client";

import { CalendarPlus, MessageSquareLock, MessageSquareReply, MessageSquareText, Sparkles } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";

import { ScheduleInterviewDialog } from "@/components/recruiter/ScheduleInterviewDialog";
import { useWorkspace } from "@/components/recruiter/WorkspaceProvider";
import { Button, buttonStyles } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toaster";
import { firstName } from "@/lib/format";
import { errorMessage } from "@/services/api";
import { STAGE_LABELS } from "@/types/application";
import type { PipelineCandidate } from "@/types/workspace";

type CandidateActionsProps = {
  candidate: PipelineCandidate;
  /** Show another of the person's applications instead. */
  onSwitchApplication?: (applicationId: string) => void;
};

export function applicationLabel(candidate: PipelineCandidate): string {
  return [candidate.role, candidate.company, STAGE_LABELS[candidate.stage]].filter(Boolean).join(" · ");
}

/**
 * What the recruiter can do for this one application: message, draft with AI, schedule an interview, and
 * let the candidate write back. A person with several applications picks which one first, and every action
 * here works on that application only.
 */
export function CandidateActions({ candidate, onSwitchApplication }: CandidateActionsProps) {
  const { candidates, setMessaging } = useWorkspace();
  const toast = useToast();
  const switchId = useId();
  const [scheduling, setScheduling] = useState(false);
  const [busy, setBusy] = useState(false);
  const first = firstName(candidate.name);
  const applications = candidates.filter((item) => item.candidateId === candidate.candidateId);
  const enabled = candidate.candidateMessagingEnabled;

  async function toggleMessaging() {
    setBusy(true);
    try {
      await setMessaging([candidate.id], !enabled);
      toast({
        title: !enabled ? `${first} can now message you` : `${first} can no longer message you`,
        description: !enabled ? `About their ${candidate.role} application only.` : "They can still read everything you send.",
        tone: "success",
      });
    } catch (error) {
      toast({ title: "Couldn't change candidate messaging", description: errorMessage(error), tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {applications.length > 1 && (
        <div className="flex flex-col gap-1.5 rounded-[10px] border border-brand-ink/25 bg-brand-soft/60 p-3">
          <label htmlFor={switchId} className="text-xs font-medium text-ink">
            {first} has {applications.length} applications. Choose the one to act on:
          </label>
          <Select
            id={switchId}
            value={candidate.id}
            onChange={(event) => onSwitchApplication?.(event.target.value)}
            disabled={!onSwitchApplication}
            className="h-8 text-[13px]"
          >
            {applications.map((item) => (
              <option key={item.id} value={item.id}>
                {applicationLabel(item)}
              </option>
            ))}
          </Select>
          <p className="text-[11px] text-stone">Everything below applies to the {candidate.role} application{candidate.company ? ` at ${candidate.company}` : ""} only.</p>
        </div>
      )}
      <div role="group" aria-label={`Actions for ${candidate.name}'s ${candidate.role} application`} className="flex flex-wrap gap-2">
        <Link href={`/recruiter/messages?candidate=${candidate.id}`} className={buttonStyles({ variant: "secondary", size: "sm" })}>
          <MessageSquareText aria-hidden /> Message
        </Link>
        <Link href={`/recruiter/messages?candidate=${candidate.id}&draft=1`} className={buttonStyles({ variant: "ai", size: "sm" })}>
          <Sparkles aria-hidden /> Draft with AI
        </Link>
        <Button variant="secondary" size="sm" onClick={() => setScheduling(true)}>
          <CalendarPlus aria-hidden /> Schedule interview
        </Button>
        <Button variant="secondary" size="sm" disabled={busy} aria-pressed={enabled} onClick={() => void toggleMessaging()}>
          {enabled ? <MessageSquareLock aria-hidden /> : <MessageSquareReply aria-hidden />}
          {enabled ? "Disable candidate messaging" : "Enable candidate messaging"}
        </Button>
      </div>
      <ScheduleInterviewDialog candidate={candidate} open={scheduling} onOpenChange={setScheduling} />
    </div>
  );
}
