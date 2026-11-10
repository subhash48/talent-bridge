"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { JobForm } from "@/components/recruiter/JobForm";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toaster";
import { errorMessage } from "@/services/api";
import { createJob, jobBoardHref, type NewJobInput } from "@/services/jobs";

/** A new role, open straight away. A public one is on the Hirvello job board, where candidates apply. */
export function CreateJobButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus aria-hidden /> Create job
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Create a job"
        description="It opens straight away. Candidates find it on the Hirvello job board and apply with their résumé."
        className="max-w-xl"
      >
        {open && <CreateJobForm onDone={() => setOpen(false)} />}
      </Modal>
    </>
  );
}

function CreateJobForm({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const toast = useToast();

  async function create(input: NewJobInput) {
    try {
      const job = await createJob(input);
      const href = jobBoardHref(job);
      toast({
        title: `${job.title} is open`,
        description: href ? "It's on the Hirvello job board now." : "It's private, so it isn't on the Hirvello job board.",
        tone: "success",
        action: href ? { label: "View", onClick: () => window.open(href, "_blank", "noopener") } : undefined,
      });
      onDone();
      router.refresh();
    } catch (caught) {
      toast({ title: "Job not created", description: errorMessage(caught, "Try again in a moment."), tone: "error" });
    }
  }

  return <JobForm idPrefix="new-job" submitLabel="Create job" onSubmit={create} onCancel={onDone} />;
}
