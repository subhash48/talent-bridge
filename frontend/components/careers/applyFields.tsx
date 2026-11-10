"use client";

import { fieldErrorId } from "@/components/ui/Field";
import { dayLabel, type Weekday } from "@/lib/days";
import { cn } from "@/lib/utils";
import { ApiError, errorMessage } from "@/services/api";
import type { ApplyProblem } from "@/components/careers/ApplyProblemAlert";
import type { CareersSite } from "@/types/careers";

// What the guest application form (ApplyForm) and the signed-in candidate's (jobs/CandidateApplyForm) share:
// the API's rules for a phone number and a LinkedIn link, the work-days question, and how the API's refusals
// land on the fields or in the alert above the button.

// The API's rule: an optional +, then digits, spaces, brackets, dots, dashes or slashes, with 7 to 15 digits.
const PHONE_PATTERN = /^\+?[0-9 ().\-/]+$/;

/** 16px on phones, so iOS doesn't zoom into a field when it's focused. */
export const NO_ZOOM = "text-base sm:text-sm";

/** What's wrong with a phone number, or null. */
export function phoneProblem(value: string, required: boolean): string | null {
  const phone = value.trim();
  const digits = phone.replace(/\D/g, "").length;
  if (!phone) return required ? "Enter your phone number." : null;
  if (!PHONE_PATTERN.test(phone) || digits < 7 || digits > 15) return "Enter a phone number, like +1 415 555 0100.";
  return null;
}

/** The link as the API takes it (with https:// when it was left off); null when empty or not on linkedin.com. */
export function linkedInUrl(value: string): string | null {
  const text = value.trim();
  if (!text) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    return url.hostname === "linkedin.com" || url.hostname.endsWith(".linkedin.com") ? url.href : null;
  } catch {
    return null;
  }
}

export const LINKEDIN_PROBLEM = "Enter a linkedin.com link, like linkedin.com/in/your-name.";

/** Refusals that belong to one field, by their error code rather than a validation path. */
const CODE_FIELDS: Record<string, string> = { invalid_resume: "resume", availability_required: "availability" };

/**
 * A refusal's details on the form's fields, by the API's field path ("phone", "resume.data") through `apiFields`.
 * complete is false when some of it belongs to no field here, so the alert shows too. A field that isn't on screen right
 * now (onScreen false: e.g. the work days, when the job had none as the page loaded) counts as no field, so a refusal
 * about it reaches the alert instead of vanishing.
 */
export function fieldErrorsFrom<F extends string>(
  error: unknown,
  apiFields: Partial<Record<string, F>>,
  onScreen: (field: F) => boolean = () => true,
): { fields: Partial<Record<F, string>>; complete: boolean } {
  const fields: Partial<Record<F, string>> = {};
  if (!(error instanceof ApiError)) return { fields, complete: false };
  const byCode = apiFields[CODE_FIELDS[error.code] ?? ""];
  if (byCode && onScreen(byCode)) {
    fields[byCode] = asSentence(error.message);
    return { fields, complete: true };
  }
  if (error.code !== "validation_error" || !Array.isArray(error.details)) return { fields, complete: false };
  let complete = error.details.length > 0;
  for (const detail of error.details as { field?: unknown; message?: unknown }[]) {
    const field = typeof detail?.field === "string" ? apiFields[detail.field.split(".")[0]] : undefined;
    if (field && onScreen(field) && typeof detail.message === "string") fields[field] ??= asSentence(detail.message);
    else complete = false;
  }
  return { fields, complete };
}

/** Anything else that stopped the application, for the alert above the button. */
export function problemFrom(error: unknown, site: CareersSite): ApplyProblem {
  if (!(error instanceof ApiError)) return { message: errorMessage(error) };
  const roleGone = error.code === "job_not_found" || error.code === "job_closed";
  if (error.status === 404 && !roleGone) {
    // The demo answers 404 to everything while it's switched off; on the board, a 404 means the role went.
    if (site === "demo") return { message: "The demo careers site is turned off." };
    return { message: "This role isn't on the job board anymore.", roleGone: true };
  }
  return { message: error.message, roleGone };
}

/** Pydantic's wording as a sentence: "Value error, enter a phone number" → "Enter a phone number." */
export function asSentence(message: string): string {
  const text = message.replace(/^value error,\s*/i, "").trim();
  const sentence = text.charAt(0).toUpperCase() + text.slice(1);
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
}

type AvailabilityProps = {
  id: string;
  days: readonly Weekday[];
  chosen: readonly Weekday[];
  onToggle: (day: Weekday) => void;
  error?: string;
  disabled?: boolean;
  className?: string;
};

/** "Which of these days can you work?", for a job that lists its work days: at least one is required. */
export function AvailabilityFieldset({ id, days, chosen, onToggle, error, disabled, className }: AvailabilityProps) {
  return (
    <fieldset className={className} aria-describedby={error ? fieldErrorId(id) : undefined}>
      <legend className="text-xs font-medium text-charcoal">
        Which of these days can you work?
        <span aria-hidden className="ml-0.5 text-faint">
          *
        </span>
      </legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {days.map((day) => (
          <label
            key={day}
            className={cn(
              "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-3.5 text-sm transition-colors has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-brand/55 sm:min-h-10",
              chosen.includes(day)
                ? "border-brand-ink bg-brand-soft text-ink"
                : "border-border bg-surface-raised text-charcoal hover:border-border-strong",
            )}
          >
            <input
              type="checkbox"
              checked={chosen.includes(day)}
              onChange={() => onToggle(day)}
              disabled={disabled}
              aria-invalid={error ? true : undefined}
              className="size-4 accent-[var(--color-brand-ink)]"
            />
            {dayLabel(day)}
          </label>
        ))}
      </div>
      {error && (
        <p id={fieldErrorId(id)} className="mt-2 text-xs text-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}
