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
import { firstName, formatSchedule } from "@/lib/format";
import { errorMessage } from "@/services/api";
import { scheduleInterview } from "@/services/interviews";
import type { InterviewFormat, PipelineCandidate } from "@/types/workspace";

type ScheduleInterviewDialogProps = {
  candidate: PipelineCandidate;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ScheduleInterviewDialog({ candidate, open, onOpenChange }: ScheduleInterviewDialogProps) {
  return (
    <Modal
      open={open}
      onClose={() => onOpenChange(false)}
      title={`Schedule an interview with ${firstName(candidate.name)}`}
      description="It's added to their timeline. Send the details from Messages; nothing goes out automatically."
    >
      {/* Mounted only while open, so the form starts fresh every time. */}
      <ScheduleForm candidate={candidate} onCancel={() => onOpenChange(false)} onScheduled={() => onOpenChange(false)} />
    </Modal>
  );
}

type FormValues = {
  title: string;
  /** datetime-local value, in the recruiter's time zone. */
  when: string;
  duration: string;
  format: InterviewFormat;
  interviewers: string;
  meetingUrl: string;
};
type Errors = Partial<Record<keyof FormValues, string>>;

const DURATIONS = [30, 45, 60, 90, 120];
const FORMATS: { value: InterviewFormat; label: string }[] = [
  { value: "video", label: "Video call" },
  { value: "phone", label: "Phone call" },
  { value: "onsite", label: "On-site" },
];

/** Tomorrow at 10:00 local time, as a datetime-local value. */
function tomorrowAtTen(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(10, 0, 0, 0);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T10:00`;
}

function validate(values: FormValues): Errors {
  const errors: Errors = {};
  if (!values.title.trim()) errors.title = "Give the interview a title, like “Technical interview”.";
  const when = new Date(values.when);
  if (!values.when || Number.isNaN(when.getTime())) errors.when = "Choose a date and time.";
  else if (when.getTime() <= Date.now()) errors.when = "Choose a time in the future.";
  if (values.meetingUrl.trim() && !/^https?:\/\//.test(values.meetingUrl.trim())) {
    errors.meetingUrl = "Enter a full link, starting with https://.";
  }
  return errors;
}

function ScheduleForm({ candidate, onCancel, onScheduled }: { candidate: PipelineCandidate; onCancel: () => void; onScheduled: () => void }) {
  const { refresh } = useWorkspace();
  const toast = useToast();
  const [values, setValues] = useState<FormValues>(() => ({
    title: "",
    when: tomorrowAtTen(),
    duration: "60",
    format: "video",
    interviewers: "",
    meetingUrl: "",
  }));
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string>();
  const errors = submitted ? validate(values) : {};

  const control = (key: keyof FormValues) => ({
    id: `schedule-${key}`,
    value: values[key],
    onChange: (event: { target: { value: string } }) => setValues((current) => ({ ...current, [key]: event.target.value })),
    "aria-invalid": errors[key] ? true : undefined,
    "aria-describedby": errors[key] ? fieldErrorId(`schedule-${key}`) : undefined,
  });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    setFormError(undefined);
    const form = event.currentTarget;
    if (Object.keys(validate(values)).length > 0) {
      requestAnimationFrame(() => form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    setSaving(true);
    try {
      const interview = await scheduleInterview(candidate, {
        title: values.title.trim(),
        format: values.format,
        scheduledAt: new Date(values.when).toISOString(),
        durationMinutes: Number(values.duration),
        interviewers: values.interviewers.split(",").map((name) => name.trim()).filter(Boolean),
        meetingUrl: values.meetingUrl.trim() || undefined,
      });
      toast({ title: `${interview.title} scheduled`, description: formatSchedule(interview.scheduledAt), tone: "success" });
      // The interview is now the candidate's latest activity and next step.
      refresh().catch(() => undefined);
      onScheduled();
    } catch (error) {
      setFormError(errorMessage(error, "Couldn't schedule the interview. Please try again."));
      setSaving(false);
    }
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid gap-3.5 sm:grid-cols-2">
        <Field label="Title" htmlFor="schedule-title" error={errors.title} required className="sm:col-span-2">
          <Input {...control("title")} placeholder="Technical interview" autoComplete="off" />
        </Field>
        <Field label="Date and time" htmlFor="schedule-when" error={errors.when} required>
          <Input {...control("when")} type="datetime-local" />
        </Field>
        <Field label="Length" htmlFor="schedule-duration">
          <Select {...control("duration")}>
            {DURATIONS.map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes} minutes
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Format" htmlFor="schedule-format">
          <Select {...control("format")}>
            {FORMATS.map((format) => (
              <option key={format.value} value={format.value}>
                {format.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Interviewers" htmlFor="schedule-interviewers">
          <Input {...control("interviewers")} placeholder="Maya Okafor, Leo Brandt" autoComplete="off" />
        </Field>
        <Field label="Meeting link" htmlFor="schedule-meetingUrl" error={errors.meetingUrl} className="sm:col-span-2">
          <Input {...control("meetingUrl")} type="url" inputMode="url" placeholder="https://" autoComplete="off" />
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
          {saving ? "Scheduling…" : "Schedule interview"}
        </Button>
      </div>
    </form>
  );
}
