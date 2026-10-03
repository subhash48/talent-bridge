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
import { STAGE_LABELS } from "@/types/application";
import { PIPELINE_STAGES, type CandidateStage, type NewCandidateInput, type PipelineCandidate } from "@/types/workspace";

type AddCandidateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles: string[];
  onCreated: (candidate: PipelineCandidate) => void;
};

export function AddCandidateDialog({ open, onOpenChange, roles, onCreated }: AddCandidateDialogProps) {
  return (
    <Modal
      open={open}
      onClose={() => onOpenChange(false)}
      title="Add candidate"
      description="Add someone to your pipeline. Nothing is sent to them until you message them."
    >
      {/* Mounted only while open, so the form starts empty every time. */}
      <AddCandidateForm roles={roles} onCancel={() => onOpenChange(false)} onCreated={onCreated} />
    </Modal>
  );
}

type FormValues = NewCandidateInput;
type Errors = Partial<Record<keyof FormValues, string>>;

const EMPTY: FormValues = { firstName: "", lastName: "", email: "", role: "", location: "", stage: "sourced" };
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(values: FormValues, existingEmails: Set<string>): Errors {
  const errors: Errors = {};
  if (!values.firstName.trim()) errors.firstName = "Enter a first name.";
  if (!values.lastName.trim()) errors.lastName = "Enter a last name.";
  const email = values.email.trim().toLowerCase();
  if (!email) errors.email = "Enter an email address.";
  else if (!EMAIL_PATTERN.test(email)) errors.email = "Enter a valid email, like name@company.com.";
  else if (existingEmails.has(email)) errors.email = "This person is already in your pipeline.";
  if (!values.role) errors.role = "Choose the role they're being considered for.";
  return errors;
}

function AddCandidateForm({ roles, onCancel, onCreated }: Omit<AddCandidateDialogProps, "open" | "onOpenChange"> & { onCancel: () => void }) {
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
      setFormError(error instanceof Error ? error.message : "Couldn't add the candidate. Please try again.");
      setSaving(false);
    }
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" htmlFor="new-candidate-firstName" error={errors.firstName} required>
          <Input {...control("firstName")} autoComplete="off" />
        </Field>
        <Field label="Last name" htmlFor="new-candidate-lastName" error={errors.lastName} required>
          <Input {...control("lastName")} autoComplete="off" />
        </Field>
        <Field label="Email" htmlFor="new-candidate-email" error={errors.email} required className="sm:col-span-2">
          <Input {...control("email")} type="email" inputMode="email" autoComplete="off" placeholder="name@company.com" />
        </Field>
        <Field label="Role" htmlFor="new-candidate-role" error={errors.role} required>
          <Select {...control("role")} className={values.role ? undefined : "text-faint"}>
            <option value="" disabled>
              Select a role
            </option>
            {roles.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Location" htmlFor="new-candidate-location">
          <Input {...control("location")} placeholder="City, country" autoComplete="off" />
        </Field>
        <Field label="Pipeline stage" htmlFor="new-candidate-stage" className="sm:col-span-2">
          <Select {...control("stage")} onChange={(event) => setValues((current) => ({ ...current, stage: event.target.value as CandidateStage }))}>
            {PIPELINE_STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {STAGE_LABELS[stage]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {formError && (
        <p role="alert" className="rounded-[10px] border border-red-400/20 bg-red-400/[0.06] px-3 py-2.5 text-sm text-red-100">
          {formError}
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 border-t border-border pt-5 sm:flex-row sm:justify-end">
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
