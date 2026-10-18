"use client";

import { LoaderCircle, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/Button";
import { Field, fieldErrorId } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toaster";
import { errorMessage } from "@/services/api";
import { createJob, type NewJobInput } from "@/services/jobs";

const EMPLOYMENT_TYPES = ["Full-time", "Part-time", "Contract", "Internship", "Temporary"];
const EMPTY: NewJobInput = { title: "", department: "", location: "", employmentType: "Full-time", description: "" };

/** A new role, open on the careers site straight away. Candidates apply there without an account. */
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
        description="It opens on your careers site, where candidates apply with their résumé. No account needed."
      >
        {open && <CreateJobForm onDone={() => setOpen(false)} />}
      </Modal>
    </>
  );
}

function CreateJobForm({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [values, setValues] = useState<NewJobInput>(EMPTY);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const titleError = submitted && !values.title.trim() ? "Enter the job title." : undefined;

  const set = (key: keyof NewJobInput) => (event: { target: { value: string } }) =>
    setValues((current) => ({ ...current, [key]: event.target.value }));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    if (!values.title.trim() || saving) return;
    setSaving(true);
    try {
      const job = await createJob(values);
      toast({
        title: `${job.title} is open`,
        description: "It's on your careers site now.",
        tone: "success",
        action: { label: "View", onClick: () => window.open(`/careers/${job.id}`, "_blank", "noopener") },
      });
      onDone();
      router.refresh();
    } catch (caught) {
      toast({ title: "Job not created", description: errorMessage(caught, "Try again in a moment."), tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
      <Field label="Job title" htmlFor="new-job-title" error={titleError} required>
        <Input
          id="new-job-title"
          value={values.title}
          onChange={set("title")}
          maxLength={200}
          aria-invalid={titleError ? true : undefined}
          aria-describedby={titleError ? fieldErrorId("new-job-title") : undefined}
          autoFocus
        />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Department" htmlFor="new-job-department">
          <Input id="new-job-department" value={values.department} onChange={set("department")} maxLength={100} />
        </Field>
        <Field label="Location" htmlFor="new-job-location">
          <Input id="new-job-location" value={values.location} onChange={set("location")} maxLength={200} placeholder="London, UK · Hybrid" />
        </Field>
      </div>
      <Field label="Employment type" htmlFor="new-job-type">
        <Select id="new-job-type" value={values.employmentType} onChange={set("employmentType")}>
          {EMPLOYMENT_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Description" htmlFor="new-job-description">
        <Textarea
          id="new-job-description"
          value={values.description}
          onChange={set("description")}
          rows={6}
          maxLength={5000}
          aria-describedby="new-job-description-hint"
        />
        <p id="new-job-description-hint" className="text-xs text-faint">
          The first paragraph is the summary on the careers site. A line starting &ldquo;Requirements:&rdquo; lists them.
        </p>
      </Field>
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button variant="ghost" onClick={onDone} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving && <LoaderCircle className="animate-spin" aria-hidden />} Create job
        </Button>
      </div>
    </form>
  );
}
