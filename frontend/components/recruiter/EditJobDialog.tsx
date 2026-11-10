"use client";

import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { JobForm } from "@/components/recruiter/JobForm";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toaster";
import { errorMessage } from "@/services/api";
import { updateJob, type NewJobInput } from "@/services/jobs";
import type { ManagedJob } from "@/types/job";

/** Edit a role's details and how it shows on the job board. Its status changes with JobStatusActions. */
export function EditJobButton({ job }: { job: ManagedJob }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);

  async function save(input: NewJobInput) {
    try {
      const saved = await updateJob(job.id, input);
      toast({ title: "Changes saved", description: `${saved.title} is up to date.`, tone: "success" });
      setOpen(false);
      router.refresh();
    } catch (caught) {
      toast({ title: "Not saved", description: errorMessage(caught, "Try again in a moment."), tone: "error" });
    }
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Pencil aria-hidden /> Edit job
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Edit job" className="max-w-xl">
        {open && <JobForm idPrefix="edit-job" job={job} submitLabel="Save changes" onSubmit={save} onCancel={() => setOpen(false)} />}
      </Modal>
    </>
  );
}
