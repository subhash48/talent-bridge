"use client";

import { ExternalLink, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { EditJobButton } from "@/components/recruiter/EditJobDialog";
import { Button, buttonStyles } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toaster";
import { errorMessage } from "@/services/api";
import { closingDatePassed, jobBoardHref, setJobStatus } from "@/services/jobs";
import type { ManagedJob } from "@/types/job";

/** See the role on the job board, edit it, close it (its candidates stay) or reopen it. */
export function JobStatusActions({ job }: { job: ManagedJob }) {
  const router = useRouter();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const open = job.status === "open";
  const href = jobBoardHref(job);

  async function change() {
    // A role reopened after its closing date would be open but still not taking applications, so the date goes.
    const clearClosingDate = !open && closingDatePassed(job);
    setSaving(true);
    try {
      const saved = await setJobStatus(job.id, open ? "closed" : "open", { clearClosingDate });
      toast({
        title: open ? `${saved.title} is closed` : `${saved.title} is open again`,
        description: clearClosingDate ? "Its closing date had passed, so it no longer has one." : undefined,
        tone: "success",
      });
      router.refresh();
    } catch (caught) {
      toast({ title: "Not changed", description: errorMessage(caught, "Try again in a moment."), tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {href && (
        <a href={href} target="_blank" rel="noopener noreferrer" className={buttonStyles({ variant: "secondary", size: "sm" })}>
          <ExternalLink aria-hidden /> Job board
        </a>
      )}
      {/* An imported role is edited where it came from: Ashby's next sync would overwrite a change made here. */}
      {!job.external && <EditJobButton job={job} />}
      <Button variant="secondary" size="sm" onClick={() => void change()} disabled={saving}>
        {saving && <LoaderCircle className="animate-spin" aria-hidden />}
        {open ? "Close role" : "Reopen role"}
      </Button>
    </>
  );
}
