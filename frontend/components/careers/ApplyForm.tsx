"use client";

import { LoaderCircle, Lock } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";

import { ApplyProblemAlert, type ApplyProblem } from "@/components/careers/ApplyProblemAlert";
import { ApplyResultCard } from "@/components/careers/ApplyResultCard";
import { ResumeInput, readResume, resumeProblem } from "@/components/careers/ResumeInput";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, fieldErrorId } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { ApiError, errorMessage } from "@/services/api";
import { applyToJob } from "@/services/careers";
import type { ApplyInput, ApplyResult } from "@/types/careers";

type Values = { firstName: string; lastName: string; email: string; phone: string; linkedinUrl: string };
type FieldName = keyof Values | "resume";
type Errors = Partial<Record<FieldName, string>>;

const EMPTY: Values = { firstName: "", lastName: "", email: "", phone: "", linkedinUrl: "" };

const IDS: Record<FieldName, string> = {
  firstName: "apply-first-name",
  lastName: "apply-last-name",
  email: "apply-email",
  phone: "apply-phone",
  linkedinUrl: "apply-linkedin",
  resume: "apply-resume",
};
const EMAIL_HINT_ID = "apply-email-hint";

// The API's field paths by their first part ("phone", "resume.data"), and the form's fields.
const API_FIELDS: Partial<Record<string, FieldName>> = {
  first_name: "firstName",
  last_name: "lastName",
  email: "email",
  phone: "phone",
  linkedin_url: "linkedinUrl",
  resume: "resume",
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// The API's rule: an optional +, then digits, spaces, brackets, dots, dashes or slashes, with 7 to 15 digits.
const PHONE_PATTERN = /^\+?[0-9 ().\-/]+$/;
// 16px on phones, so iOS doesn't zoom into a field when it's focused.
const NO_ZOOM = "text-base sm:text-sm";

function validate(values: Values, resume: File | null): Errors {
  const errors: Errors = {};
  if (!values.firstName.trim()) errors.firstName = "Enter your first name.";
  if (!values.lastName.trim()) errors.lastName = "Enter your last name.";
  const email = values.email.trim();
  if (!email) errors.email = "Enter your email address.";
  else if (!EMAIL_PATTERN.test(email)) errors.email = "Enter a valid email address, like name@example.com.";
  const phone = values.phone.trim();
  const digits = phone.replace(/\D/g, "").length;
  if (!phone) errors.phone = "Enter your phone number.";
  else if (!PHONE_PATTERN.test(phone) || digits < 7 || digits > 15) errors.phone = "Enter a phone number, like +1 415 555 0100.";
  if (values.linkedinUrl.trim() && !linkedInUrl(values.linkedinUrl)) {
    errors.linkedinUrl = "Enter a linkedin.com link, like linkedin.com/in/your-name.";
  }
  const resumeError = resume ? resumeProblem(resume) : "Attach your résumé.";
  if (resumeError) errors.resume = resumeError;
  return errors;
}

/** The link as the API takes it (with https:// when it was left off); null when empty or not on linkedin.com. */
function linkedInUrl(value: string): string | null {
  const text = value.trim();
  if (!text) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    return url.hostname === "linkedin.com" || url.hostname.endsWith(".linkedin.com") ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * The application form, then what happened to it. Nothing reaches the hiring team from here: the API
 * keeps the application pending until the applicant activates their candidate portal account or signs
 * in, and the result says which of those to do.
 */
export function ApplyForm({ jobId }: { jobId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  // What was sent last, so "Try again" can send exactly the same.
  const sent = useRef<ApplyInput | null>(null);
  const [values, setValues] = useState<Values>(EMPTY);
  const [resume, setResume] = useState<File | null>(null);
  // Problems show from the first submit on, updating as they type; a chosen file is checked at once.
  const [checkAll, setCheckAll] = useState(false);
  const [resumeChosen, setResumeChosen] = useState(false);
  // Field errors only a submit finds: the API's, or a file that couldn't be read. Editing the field clears it.
  const [submitErrors, setSubmitErrors] = useState<Errors>({});
  const [problem, setProblem] = useState<ApplyProblem | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [focusRequest, setFocusRequest] = useState<{ target: "invalid" | "submit" } | null>(null);

  const problems = validate(values, resume);
  const errors: Errors = { ...submitErrors };
  for (const [field, message] of Object.entries(problems) as [FieldName, string][]) {
    if (checkAll || (field === "resume" && resumeChosen)) errors[field] = message;
  }

  // After a failed submit, once its problems have rendered: the first field with one, or the submit
  // button again (it was disabled while sending).
  useEffect(() => {
    if (!focusRequest) return;
    const selector = focusRequest.target === "invalid" ? '[aria-invalid="true"]' : 'button[type="submit"]';
    formRef.current?.querySelector<HTMLElement>(selector)?.focus();
  }, [focusRequest]);

  function update(field: keyof Values) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      const { value } = event.target;
      setValues((current) => ({ ...current, [field]: value }));
      setSubmitErrors((current) => ({ ...current, [field]: undefined }));
    };
  }

  function chooseResume(file: File | null) {
    setResume(file);
    setResumeChosen(Boolean(file));
    setSubmitErrors((current) => ({ ...current, resume: undefined }));
  }

  const control = (field: keyof Values, hintId?: string) => ({
    id: IDS[field],
    value: values[field],
    onChange: update(field),
    "aria-invalid": errors[field] ? true : undefined,
    "aria-describedby": [hintId, errors[field] && fieldErrorId(IDS[field])].filter(Boolean).join(" ") || undefined,
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setCheckAll(true);
    setProblem(null);
    if (!resume || Object.keys(problems).length > 0) {
      setFocusRequest({ target: "invalid" });
      return;
    }
    setPending(true);
    let upload: ApplyInput["resume"];
    try {
      upload = await readResume(resume);
    } catch {
      setSubmitErrors((current) => ({ ...current, resume: "We couldn't read that file. Choose it again." }));
      setPending(false);
      setFocusRequest({ target: "invalid" });
      return;
    }
    await send({
      firstName: values.firstName.trim(),
      lastName: values.lastName.trim(),
      email: values.email.trim(),
      phone: values.phone.trim(),
      linkedinUrl: linkedInUrl(values.linkedinUrl),
      resume: upload,
    });
  }

  async function send(input: ApplyInput) {
    setPending(true);
    setProblem(null);
    try {
      const outcome = await applyToJob(jobId, input);
      sent.current = input;
      setSubmitErrors({});
      setAttempts((count) => count + 1);
      setResult(outcome);
    } catch (error) {
      const { fields, complete } = fieldErrorsFrom(error);
      setSubmitErrors(fields);
      if (!complete) setProblem(problemFrom(error));
      if (Object.keys(fields).length > 0) {
        setResult(null); // from "Try again": back to the form, where the fields are
        setFocusRequest({ target: "invalid" });
      } else if (!result) {
        setFocusRequest({ target: "submit" });
      }
    } finally {
      setPending(false);
    }
  }

  function retry() {
    if (sent.current) void send(sent.current);
  }

  if (result) {
    return (
      <ApplyResultCard
        result={result}
        problem={problem}
        retrying={pending}
        stillFailing={attempts > 1 && result.status === "invitation_failed"}
        onRetry={retry}
      />
    );
  }

  return (
    <form ref={formRef} noValidate onSubmit={(event) => void submit(event)}>
      <Card className="p-5 sm:p-7">
        <h2 className="font-semibold tracking-tight text-ink">Your details</h2>
        <p className="mt-1 text-sm text-stone">Fields marked * are required.</p>
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="First name" htmlFor={IDS.firstName} error={errors.firstName} required>
            <Input {...control("firstName")} required autoComplete="given-name" maxLength={100} className={NO_ZOOM} />
          </Field>
          <Field label="Last name" htmlFor={IDS.lastName} error={errors.lastName} required>
            <Input {...control("lastName")} required autoComplete="family-name" maxLength={100} className={NO_ZOOM} />
          </Field>
          <Field label="Email" htmlFor={IDS.email} error={errors.email} required>
            <Input
              {...control("email", EMAIL_HINT_ID)}
              type="email"
              inputMode="email"
              required
              autoComplete="email"
              maxLength={254}
              placeholder="name@example.com"
              className={NO_ZOOM}
            />
            <p id={EMAIL_HINT_ID} className="text-xs text-faint">
              Your activation link is sent here.
            </p>
          </Field>
          <Field label="Phone number" htmlFor={IDS.phone} error={errors.phone} required>
            <Input {...control("phone")} type="tel" required autoComplete="tel" maxLength={40} placeholder="+1 415 555 0100" className={NO_ZOOM} />
          </Field>
          <Field label="LinkedIn URL (optional)" htmlFor={IDS.linkedinUrl} error={errors.linkedinUrl} className="sm:col-span-2">
            <Input
              {...control("linkedinUrl")}
              type="url"
              inputMode="url"
              autoComplete="url"
              maxLength={2000}
              placeholder="linkedin.com/in/your-name"
              className={NO_ZOOM}
            />
          </Field>
        </div>

        <div className="mt-6 border-t border-border pt-6">
          <Field label="Résumé" htmlFor={IDS.resume} error={errors.resume} required>
            <ResumeInput id={IDS.resume} file={resume} onChange={chooseResume} error={errors.resume} disabled={pending} />
          </Field>
          <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-faint">
            <Lock aria-hidden className="mt-px size-3.5 shrink-0" />
            Your résumé is stored privately and shared only with the hiring team.
          </p>
        </div>

        {problem && (
          <div className="mt-6">
            <ApplyProblemAlert problem={problem} />
          </div>
        )}

        <div className="mt-6 flex justify-end border-t border-border pt-6">
          <Button type="submit" size="lg" disabled={pending} className="w-full sm:w-auto">
            {pending && <LoaderCircle className="animate-spin" aria-hidden />}
            {pending ? "Sending…" : "Submit application"}
          </Button>
        </div>
        <p className="sr-only" aria-live="polite">
          {pending ? "Sending your application…" : ""}
        </p>
      </Card>
    </form>
  );
}

/** A validation error's details, on the form's fields. complete is false when some belong to no field here. */
function fieldErrorsFrom(error: unknown): { fields: Errors; complete: boolean } {
  const fields: Errors = {};
  if (!(error instanceof ApiError) || error.code !== "validation_error" || !Array.isArray(error.details)) {
    return { fields, complete: false };
  }
  let complete = error.details.length > 0;
  for (const detail of error.details as { field?: unknown; message?: unknown }[]) {
    const field = typeof detail?.field === "string" ? API_FIELDS[detail.field.split(".")[0]] : undefined;
    if (field && typeof detail.message === "string") fields[field] ??= asSentence(detail.message);
    else complete = false;
  }
  return { fields, complete };
}

/** Anything else that stopped the application, for the alert above the button. */
function problemFrom(error: unknown): ApplyProblem {
  if (!(error instanceof ApiError)) return { message: errorMessage(error) };
  // A role that's gone answers job_not_found; any other 404 means the whole demo is switched off.
  if (error.status === 404 && error.code !== "job_not_found") return { message: "The demo careers site is turned off." };
  return { message: error.message, roleGone: error.code === "job_not_found" || error.code === "job_closed" };
}

/** Pydantic's wording as a sentence: "Value error, enter a phone number" → "Enter a phone number." */
function asSentence(message: string): string {
  const text = message.replace(/^value error,\s*/i, "").trim();
  const sentence = text.charAt(0).toUpperCase() + text.slice(1);
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
}
