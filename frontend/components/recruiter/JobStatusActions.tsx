"use client";

import { ExternalLink, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, buttonStyles } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toaster";
import { errorMessage } from "@/services/api";
import { setJobStatus } from "@/services/jobs";
import type { JobOpening } from "@/types/workspace";

/** See the role on the careers site, close it (its candidates stay) or reopen it. */
export function JobStatusActions({ job }: { job: JobOpening }) {
  const router = useRouter();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const open = job.status === "open";

  async function change() {
    setSaving(true);
    try {
      const saved = await setJobStatus(job.id, open ? "closed" : "open");
      toast({ title: open ? `${saved.title} is closed` : `${saved.title} is open again`, tone: "success" });
      router.refresh();
    } catch (caught) {
      toast({ title: "Not changed", description: errorMessage(caught, "Try again in a moment."), tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {open && (
        <a href={`/careers/${job.id}`} target="_blank" rel="noopener noreferrer" className={buttonStyles({ variant: "secondary", size: "sm" })}>
          <ExternalLink aria-hidden /> Careers page
        </a>
      )}
      <Button variant="secondary" size="sm" onClick={() => void change()} disabled={saving}>
        {saving && <LoaderCircle className="animate-spin" aria-hidden />}
        {open ? "Close role" : "Reopen role"}
      </Button>
    </>
  );
}
