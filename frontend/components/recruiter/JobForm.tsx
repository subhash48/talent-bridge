"use client";

import { LoaderCircle } from "lucide-react";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Field, fieldErrorId } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import type { NewJobInput } from "@/services/jobs";
import {
  SALARY_CURRENCIES,
  SALARY_LIMIT,
  SALARY_PERIODS,
  WORK_ARRANGEMENTS,
  type JobSource,
  type JobWorkArrangement,
  type ManagedJob,
  type SalaryPeriod,
} from "@/types/job";

const EMPLOYMENT_TYPES = ["Full-time", "Part-time", "Contract", "Internship", "Temporary"];

/** The form as typed: numbers and the closing day stay strings until it's sent. */
type FormValues = {
  title: string;
  department: string;
  location: string;
  employmentType: string;
  description: string;
  workArrangement: "" | JobWorkArrangement;
  salaryMin: string;
  salaryMax: string;
  salaryCurrency: string;
  salaryPeriod: SalaryPeriod;
  /** "yyyy-mm-dd" in the employer's own time zone, or "" for no closing date. */
  closesOn: string;
  onBoard: boolean;
};

type Errors = Partial<Record<"title" | "salaryMin" | "salaryMax" | "closesOn", string>>;
/** The id suffix of each field that can have an error. */
const ERROR_FIELDS: Record<keyof Errors, string> = { title: "title", salaryMin: "salary-min", salaryMax: "salary-max", closesOn: "closes" };

const BOARD_TABS: Record<JobSource, string> = { recruiter: "Recruiter Jobs", small_business: "Small Business Jobs" };

type JobFormProps = {
  /** Field ids start with it, e.g. "new-job" gives #new-job-title. */
  idPrefix: string;
  /** The job being edited; a new job starts empty and public. */
  job?: ManagedJob;
  submitLabel: string;
  onSubmit: (input: NewJobInput) => Promise<void>;
  onCancel: () => void;
};

/** A job's details and how it shows on the Hirvello job board, for creating a job or editing one. */
export function JobForm({ idPrefix, job, submitLabel, onSubmit, onCancel }: JobFormProps) {
  const [initial] = useState(() => valuesFor(job));
  const [values, setValues] = useState<FormValues>(initial);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const id = (name: string) => `${idPrefix}-${name}`;
  // An existing date that has already passed may stay as it is; a newly chosen one must be ahead.
  const errors = submitted ? validate(values, values.closesOn !== initial.closesOn) : {};
  const hasSalary = Boolean(values.salaryMin.trim() || values.salaryMax.trim());

  const set = (key: keyof FormValues) => (event: { target: { value: string } }) =>
    setValues((current) => ({ ...current, [key]: event.target.value }));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    if (saving || Object.keys(validate(values, values.closesOn !== initial.closesOn)).length > 0) return;
    setSaving(true);
    try {
      // Unchanged, the closing moment goes back exactly as the API gave it rather than re-derived from the day.
      const expiresAt = values.closesOn === initial.closesOn ? (job?.expiresAt ?? null) : endOfDay(values.closesOn);
      await onSubmit(toInput(values, expiresAt));
    } finally {
      setSaving(false);
    }
  }

  const invalid = (field: keyof Errors, describedBy?: string) => ({
    "aria-invalid": errors[field] ? true : undefined,
    "aria-describedby": [errors[field] ? fieldErrorId(id(ERROR_FIELDS[field])) : null, describedBy]
      .filter(Boolean)
      .join(" ") || undefined,
  });

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
      <Field label="Job title" htmlFor={id("title")} error={errors.title} required>
        <Input id={id("title")} value={values.title} onChange={set("title")} maxLength={200} autoFocus {...invalid("title")} />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Department" htmlFor={id("department")}>
          <Input id={id("department")} value={values.department} onChange={set("department")} maxLength={100} />
        </Field>
        <Field label="Location" htmlFor={id("location")}>
          <Input id={id("location")} value={values.location} onChange={set("location")} maxLength={200} placeholder="London, UK" />
        </Field>
        <Field label="Employment type" htmlFor={id("type")}>
          <Select id={id("type")} value={values.employmentType} onChange={set("employmentType")}>
            {/* An imported job can carry a type the list doesn't have; it stays selectable. */}
            {[...new Set([...EMPLOYMENT_TYPES, values.employmentType])].map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Work arrangement" htmlFor={id("arrangement")}>
          <Select id={id("arrangement")} value={values.workArrangement} onChange={set("workArrangement")}>
            <option value="">Not specified</option>
            {WORK_ARRANGEMENTS.map((arrangement) => (
              <option key={arrangement.value} value={arrangement.value}>
                {arrangement.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <fieldset className="flex flex-col gap-2" aria-describedby={id("salary-hint")}>
        <legend className="text-[13px] font-medium text-ink">Salary</legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_5.75rem_7.5rem]">
          <Field label="Minimum" htmlFor={id("salary-min")} error={errors.salaryMin} className="[&>label]:text-xs [&>label]:text-stone">
            <Input
              id={id("salary-min")}
              value={values.salaryMin}
              onChange={set("salaryMin")}
              inputMode="numeric"
              autoComplete="off"
              placeholder="80000"
              {...invalid("salaryMin")}
            />
          </Field>
          <Field label="Maximum" htmlFor={id("salary-max")} error={errors.salaryMax} className="[&>label]:text-xs [&>label]:text-stone">
            <Input
              id={id("salary-max")}
              value={values.salaryMax}
              onChange={set("salaryMax")}
              inputMode="numeric"
              autoComplete="off"
              placeholder="100000"
              {...invalid("salaryMax")}
            />
          </Field>
          <Field label="Currency" htmlFor={id("currency")} className="[&>label]:text-xs [&>label]:text-stone">
            <Select id={id("currency")} value={values.salaryCurrency} onChange={set("salaryCurrency")} disabled={!hasSalary}>
              {[...new Set([...SALARY_CURRENCIES, values.salaryCurrency])].map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Per" htmlFor={id("period")} className="[&>label]:text-xs [&>label]:text-stone">
            <Select id={id("period")} value={values.salaryPeriod} onChange={set("salaryPeriod")} disabled={!hasSalary}>
              {SALARY_PERIODS.map((period) => (
                <option key={period.value} value={period.value}>
                  {period.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <p id={id("salary-hint")} className="text-xs text-faint">
          Optional. Give one figure or a range; job seekers can filter by it.
        </p>
      </fieldset>

      <Field label="Description" htmlFor={id("description")}>
        <Textarea
          id={id("description")}
          value={values.description}
          onChange={set("description")}
          rows={6}
          maxLength={5000}
          aria-describedby={id("description-hint")}
        />
        <p id={id("description-hint")} className="text-xs text-faint">
          The first paragraph is the summary on the job board. A line starting &ldquo;Requirements:&rdquo; lists them.
        </p>
      </Field>

      <div className="flex flex-col gap-4 border-t border-border pt-4">
        <Field label="Applications close on" htmlFor={id("closes")} error={errors.closesOn} className="sm:max-w-[15rem]">
          <Input
            id={id("closes")}
            type="date"
            value={values.closesOn}
            onChange={set("closesOn")}
            min={localDay(new Date())}
            {...invalid("closesOn", id("closes-hint"))}
          />
          <p id={id("closes-hint")} className="text-xs text-faint">
            Optional. After this day the job leaves the board and stops taking applications.
          </p>
        </Field>
        <div>
          <label htmlFor={id("board")} className="flex min-h-11 w-fit cursor-pointer items-center gap-2.5 text-sm font-medium text-ink">
            <Checkbox
              id={id("board")}
              checked={values.onBoard}
              onCheckedChange={(checked) => setValues((current) => ({ ...current, onBoard: checked === true }))}
              aria-describedby={id("board-hint")}
            />
            Show on the Hirvello job board
          </label>
          <p id={id("board-hint")} className="text-xs text-faint">
            Public jobs appear on hirvello.com/jobs under {BOARD_TABS[job?.postedBy ?? "recruiter"]}.
            {!values.onBoard && " This one stays private: only people you add yourself join its pipeline."}
          </p>
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving && <LoaderCircle className="animate-spin" aria-hidden />} {submitLabel}
        </Button>
      </div>
    </form>
  );
}

function valuesFor(job: ManagedJob | undefined): FormValues {
  return {
    title: job?.title ?? "",
    department: job?.department ?? "",
    location: job?.location ?? "",
    employmentType: job?.employmentType ?? "Full-time",
    description: job?.description ?? "",
    workArrangement: job?.workArrangement ?? "",
    salaryMin: String(job?.salaryMin ?? ""),
    salaryMax: String(job?.salaryMax ?? ""),
    salaryCurrency: job?.salaryCurrency ?? "USD",
    salaryPeriod: job?.salaryPeriod ?? "year",
    closesOn: job?.expiresAt ? localDay(new Date(job.expiresAt)) : "",
    onBoard: (job?.visibility ?? "public") === "public",
  };
}

/** "80,000", "80 000" and "80000" are the same figure. Null when empty, NaN when it isn't a whole number. */
function salaryFigure(text: string): number | null {
  const plain = text.replace(/[\s,]/g, "");
  if (!plain) return null;
  return /^\d+$/.test(plain) ? Number(plain) : Number.NaN;
}

function validate(values: FormValues, closingDateChanged: boolean): Errors {
  const errors: Errors = {};
  if (!values.title.trim()) errors.title = "Enter the job title.";
  const min = salaryFigure(values.salaryMin);
  const max = salaryFigure(values.salaryMax);
  const outOfRange = (figure: number | null) => figure !== null && (Number.isNaN(figure) || figure > SALARY_LIMIT);
  if (outOfRange(min)) errors.salaryMin = "Enter a whole number up to 10,000,000.";
  if (outOfRange(max)) errors.salaryMax = "Enter a whole number up to 10,000,000.";
  else if (min !== null && max !== null && !Number.isNaN(min) && max < min) errors.salaryMax = "Make it at least the minimum.";
  if (values.closesOn) {
    const end = endOfDay(values.closesOn);
    if (!end) errors.closesOn = "Enter a real date.";
    else if (closingDateChanged && new Date(end).getTime() <= Date.now()) errors.closesOn = "Choose a closing date in the future.";
  }
  return errors;
}

function toInput(values: FormValues, expiresAt: string | null): NewJobInput {
  return {
    title: values.title,
    department: values.department,
    location: values.location,
    employmentType: values.employmentType,
    description: values.description,
    workArrangement: values.workArrangement || null,
    salaryMin: salaryFigure(values.salaryMin),
    salaryMax: salaryFigure(values.salaryMax),
    salaryCurrency: values.salaryCurrency,
    salaryPeriod: values.salaryPeriod,
    expiresAt,
    visibility: values.onBoard ? "public" : "private",
  };
}

/** The day as a date input holds it, in the employer's own time zone. */
function localDay(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * "Applications close on 30 Nov" means candidates can still apply all that day, so the job closes at the
 * end of it in the employer's time zone. Null for anything that isn't a real yyyy-mm-dd day.
 */
function endOfDay(day: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return null;
  const [year, month, date] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const end = new Date(year, month - 1, date, 23, 59, 59, 999);
  return end.getMonth() === month - 1 && end.getDate() === date ? end.toISOString() : null;
}
