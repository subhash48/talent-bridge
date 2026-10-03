import { useState } from "react";

import { useCandidatePortal } from "@/components/candidate/CandidatePortalProvider";
import { useToast } from "@/components/ui/Toaster";
import { formatSchedule } from "@/lib/format";
import { errorMessage } from "@/services/api";
import { confirmInterview } from "@/services/portal";
import type { CandidateInterview } from "@/types/portal";

/**
 * Confirms an interview and updates the portal at once. The confirmation is saved on the same
 * interview the recruiter scheduled, so their schedule shows it too.
 */
export function useConfirmInterview(onConfirmed?: (interview: CandidateInterview) => void) {
  const { refresh, update } = useCandidatePortal();
  const toast = useToast();
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function confirm(interview: CandidateInterview) {
    if (pendingId) return;
    setPendingId(interview.id);
    try {
      const confirmed = await confirmInterview(interview.id);
      update((me) => (me.nextInterview?.id === confirmed.id ? { ...me, nextInterview: confirmed } : me));
      onConfirmed?.(confirmed);
      toast({
        title: "Interview confirmed",
        description: `${confirmed.title}, ${formatSchedule(confirmed.scheduledAt)}. The hiring team can see you're set.`,
        tone: "success",
      });
      void refresh();
    } catch (error) {
      toast({ title: "Couldn't confirm your interview", description: errorMessage(error), tone: "error" });
    } finally {
      setPendingId(null);
    }
  }

  return { confirm, pendingId };
}
