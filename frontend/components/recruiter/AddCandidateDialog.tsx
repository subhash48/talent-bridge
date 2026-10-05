"use client";

import { LoaderCircle } from "lucide-react";
import { useState, type FormEvent } from "react";

import { useWorkspace } from "@/components/recruiter/WorkspaceProvider";
import { Button } from "@/components/ui/Button";
import { Field, fieldErrorId } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toaster";
import { errorMessage } from "@/services/api";
import { STAGE_LABELS } from "@/types/application";
import { PIPELINE_STAGES, type CandidateStage, type JobOpening, type NewCandidateInput, type PipelineCandidate } from "@/types/workspace";

// Hired needs an offer first, so new candidates start at one of the earlier stages.
const STARTING_STAGES = PIPELINE_STAGES.filter((stage) => stage !== "hired");

type AddCandidateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Open jobs the candidate can be added to. */
  jobs: JobOpening[];
  onCreated: (candidate: PipelineCandidate) => void;
};

export function AddCandidateDialog({ open, onOpenChange, jobs, onCreated }: AddCandidateDialogProps) {
  return (
    <Modal
      open={open}
      onClose={() => onOpenChange(false)}
      title="Add candidate"
      description="Add someone to your pipeline. Nothing is sent to them until you message them."
    >
      {/* Mounted only while open, so the form starts empty every time. */}
      <AddCandidateForm jobs={jobs} onCancel={() => onOpenChange(false)} onCreated={onCreated} />
    </Modal>
  );
}

type FormValues = NewCandidateInput;
type Errors = Partial<Record<keyof FormValues, string>>;

const EMPTY: FormValues = { firstName: "", lastName: "", email: "", jobId: "", location: "", stage: "sourced" };
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(values: FormValues, existingEmails: Set<string>): Errors {
  const errors: Errors = {};
  if (!values.firstName.trim()) errors.firstName = "Enter a first name.";
  if (!values.lastName.trim()) errors.lastName = "Enter a last name.";
  const email = values.email.trim().toLowerCase();
  if (!email) errors.email = "Enter an email address.";
  else if (!EMAIL_PATTERN.test(email)) errors.email = "Enter a valid email, like name@company.com.";
  else if (existingEmails.has(email)) errors.email = "This person is already in your pipeline.";
  if (!values.jobId) errors.jobId = "Choose the role they're being considered for.";
  return errors;
}

function AddCandidateForm({ jobs, onCancel, onCreated }: Omit<AddCandidateDialogProps, "open" | "onOpenChange"> & { onCancel: () => void }) {
  const { candidates, addCandidate } = useWorkspace();
  const toast = useToast();
  const [values, setValues] = useState<FormValues>(EMPTY);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string>();

  const existingEmails = new Set(candidates.flatMap((candidate) => (candidate.email ? [candidate.email.toLowerCase()] : [])));
  const errors = submitted ? validate(values, existingEmails) : {};

  const set = (key: keyof FormValues) => (event: { target: { value: string } }) =>
    setValues((current) => ({ ...current, [key]: event.target.value }));

  const control = (key: keyof FormValues) => ({
    id: `new-candidate-${key}`,
    value: values[key],
    onChange: set(key),
    "aria-invalid": errors[key] ? true : undefined,
    "aria-describedby": errors[key] ? fieldErrorId(`new-candidate-${key}`) : undefined,
  });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    setFormError(undefined);
    const form = event.currentTarget;
    if (Object.keys(validate(values, existingEmails)).length > 0) {
      // Let the error state render, then move focus to the first problem.
      requestAnimationFrame(() => form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    setSaving(true);
    try {
      const candidate = await addCandidate(values);
      toast({ title: `${candidate.name} added`, description: `${STAGE_LABELS[candidate.stage]} · ${candidate.role}`, tone: "success" });
      onCreated(candidate);
    } catch (error) {
      setFormError(errorMessage(error, "Couldn't add the candidate. Please try again."));
      setSaving(false);
    }
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid gap-3.5 sm:grid-cols-2">
        <Field label="First name" htmlFor="new-candidate-firstName" error={errors.firstName} required>
          <Input {...control("firstName")} autoComplete="off" />
        </Field>
        <Field label="Last name" htmlFor="new-candidate-lastName" error={errors.lastName} required>
          <Input {...control("lastName")} autoComplete="off" />
        </Field>
        <Field label="Email" htmlFor="new-candidate-email" error={errors.email} required className="sm:col-span-2">
          <Input {...control("email")} type="email" inputMode="email" autoComplete="off" placeholder="name@company.com" />
        </Field>
        <Field label="Role" htmlFor="new-candidate-jobId" error={errors.jobId} required>
          <Select {...control("jobId")} className={values.jobId ? undefined : "text-faint"}>
            <option value="" disabled>
              Select a role
            </option>
            {jobs.map((job) => (
              <option key={job.id} value={job.id}>
                {job.title}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Location" htmlFor="new-candidate-location">
          <Input {...control("location")} placeholder="City, country" autoComplete="off" />
        </Field>
        <Field label="Pipeline stage" htmlFor="new-candidate-stage" className="sm:col-span-2">
          <Select {...control("stage")} onChange={(event) => setValues((current) => ({ ...current, stage: event.target.value as CandidateStage }))}>
            {STARTING_STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {STAGE_LABELS[stage]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {formError && (
        <p role="alert" className="rounded-[8px] border border-danger/20 bg-danger/[0.06] px-3 py-2.5 text-sm text-danger">
          {formError}
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving && <LoaderCircle className="animate-spin" aria-hidden />}
          {saving ? "Adding…" : "Add candidate"}
        </Button>
      </div>
    </form>
  );
}
