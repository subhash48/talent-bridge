"use client";

import { ArrowLeft, ExternalLink, Globe, LoaderCircle, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";

import { DemoJobStatusBadge } from "@/components/recruiter/DemoJobStatusBadge";
import { RecruiterHeader } from "@/components/recruiter/RecruiterHeader";
import { Button, buttonStyles } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, fieldErrorId } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toaster";
import { pluralize } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ApiError, errorMessage } from "@/services/api";
import { createDemoJob, generateDemoJobPosting, publishDemoJob, updateDemoJob } from "@/services/demo-jobs";
import {
  EMPLOYMENT_TYPES,
  MAX_ABOUT_ROLE,
  MAX_ABOUT_TEAM,
  MAX_ITEM,
  MAX_ITEMS,
  MAX_NOTES,
  MAX_SKILL,
  MAX_SKILLS,
  MAX_SUMMARY,
  SENIORITIES,
  WORK_ARRANGEMENTS,
  type DemoJob,
  type DemoJobCreate,
  type DemoPostingStatus,
  type EmploymentType,
  type JobPostingBrief,
  type JobPostingContent,
  type Seniority,
  type WorkArrangement,
} from "@/types/demo";

// The form keeps text as typed: lists are one item per line, and cleaned up only when they're sent.
type FormValues = {
  title: string;
  department: string;
  location: string;
  work_arrangement: string;
  employment_type: string;
  seniority: string;
  notes: string;
  summary: string;
  about_role: string;
  responsibilities: string;
  requirements: string;
  preferred_qualifications: string;
  about_team: string;
};
type FieldKey = keyof FormValues | "skills";
type Errors = Partial<Record<FieldKey, string>>;
type Pending = "generate" | "save" | "publish";

/** The posting's text, which the AI job writer fills in. */
const POSTING_KEYS = ["summary", "about_role", "responsibilities", "requirements", "preferred_qualifications", "about_team"] as const;
const LIST_KEYS = ["responsibilities", "requirements", "preferred_qualifications"] as const;
/** Every field, in the order the form shows them; the API's error details use the same names. */
const FIELD_ORDER: readonly FieldKey[] = [
  "title",
  "department",
  "location",
  "work_arrangement",
  "employment_type",
  "seniority",
  "skills",
  "notes",
  ...POSTING_KEYS,
];

const SUBTITLES: Record<DemoPostingStatus | "new", string> = {
  new: "A development demo posting. Fill in the basics, let the AI draft the text, then review it and publish it.",
  draft: "A development demo posting. It isn't on the demo careers site until you publish it.",
  published: "A development demo posting, live on the demo careers site. Changes you save show there straight away.",
  closed: "A development demo posting. It's closed: off the demo careers site, and not taking applications.",
};

const SAVED: Record<DemoPostingStatus, string> = {
  draft: "It isn't on the demo careers site until you publish it.",
  published: "The changes are live on the demo careers site.",
  closed: "The job stays closed.",
};

// Long text fields grow with their content where the browser supports it.
const growing = "field-sizing-content max-h-[28rem]";

/** /recruiter/jobs/demo/new and /recruiter/jobs/demo/[id]: a demo job's basics and posting, with the AI job writer. */
export function DemoJobEditor({ job: initialJob }: { job?: DemoJob }) {
  const router = useRouter();
  const toast = useToast();
  // The saved version: undefined until a new job is first saved.
  const [job, setJob] = useState(initialJob);
  const [values, setValues] = useState(() => toValues(initialJob));
  const [skills, setSkills] = useState(initialJob?.skills ?? []);
  const [skillDraft, setSkillDraft] = useState("");
  // Which check the live validation runs: the last action the recruiter tried.
  const [attempt, setAttempt] = useState<Pending>();
  const [serverErrors, setServerErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string>();
  const [pending, setPending] = useState<Pending>();
  const [generatedBy, setGeneratedBy] = useState(initialJob?.generated_by_model ?? undefined);
  const [removed, setRemoved] = useState(0);
  const [aiError, setAiError] = useState<string>();
  const [confirmReplace, setConfirmReplace] = useState(false);

  const busy = pending !== undefined;
  const generating = pending === "generate";
  const published = job?.status === "published";
  const errors: Errors = { ...serverErrors, ...(attempt ? validate(values, checkFor(attempt, published)) : {}) };

  function clearServerError(key: FieldKey) {
    if (!serverErrors[key]) return;
    setServerErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  const describedBy = (key: FieldKey, hint: boolean) =>
    [hint && hintId(key), errors[key] && fieldErrorId(fieldId(key))].filter(Boolean).join(" ") || undefined;

  const control = (key: keyof FormValues, { hint = false } = {}) => ({
    id: fieldId(key),
    value: values[key],
    onChange: (event: { target: { value: string } }) => {
      setValues((current) => ({ ...current, [key]: event.target.value }));
      clearServerError(key);
    },
    // The AI is about to replace the posting's text, so it can't be edited meanwhile.
    ...((POSTING_KEYS as readonly string[]).includes(key) && { readOnly: generating }),
    "aria-invalid": errors[key] ? true : undefined,
    "aria-describedby": describedBy(key, hint),
  });

  function addSkills(text: string) {
    if (!text.trim()) return;
    const added = text.split(",").map((skill) => skill.trim().slice(0, MAX_SKILL));
    setSkills((current) => cleanList([...current, ...added]).slice(0, MAX_SKILLS));
    clearServerError("skills");
  }

  function requestDraft() {
    if (busy) return;
    setAttempt("generate");
    setAiError(undefined);
    const problems = validate(values, "brief");
    if (hasErrors(problems)) return focusFirst(problems);
    // Asks first when there's text the draft would replace: the recruiter may have written or edited it.
    if (POSTING_KEYS.some((key) => values[key].trim())) setConfirmReplace(true);
    else void generate();
  }

  async function generate() {
    setPending("generate");
    try {
      const result = await generateDemoJobPosting(toBrief(values, skills));
      setValues((current) => ({ ...current, ...fromDraft(result.draft) }));
      // The recruiter's skills first, then the ones the AI suggests.
      setSkills((current) => cleanList([...current, ...result.draft.skills]).slice(0, MAX_SKILLS));
      setGeneratedBy(result.model_name);
      setRemoved(result.removed);
      // Earlier save errors were about text the draft has just replaced.
      setServerErrors({});
      setFormError(undefined);
    } catch (error) {
      const problems = fieldErrors(error);
      setServerErrors(problems);
      setAiError(errorMessage(error, "Couldn't write a draft. Please try again."));
      focusFirst(problems);
    } finally {
      setPending(undefined);
    }
  }

  async function save(intent: "save" | "publish") {
    if (busy) return;
    setAttempt(intent);
    setFormError(undefined);
    setServerErrors({});
    const problems = validate(values, checkFor(intent, published));
    if (hasErrors(problems)) return focusFirst(problems);

    setPending(intent);
    let saved: DemoJob | undefined;
    try {
      const posting: DemoJobCreate = {
        ...toPosting(values, skills),
        ...(generatedBy ? { generated_by_model: generatedBy } : {}),
      };
      saved = job ? await updateDemoJob(job.id, posting) : await createDemoJob(posting);
      setJob(saved);
      // From here on this page edits the saved job, and a reload opens it.
      if (!job) window.history.replaceState(null, "", `/recruiter/jobs/demo/${saved.id}`);
      if (intent === "save") {
        toast({ title: saved.status === "draft" ? "Draft saved" : "Changes saved", description: SAVED[saved.status], tone: "success" });
        setPending(undefined);
        return;
      }
      await publishDemoJob(saved.id);
      toast({ title: "Demo job published", description: `${saved.title} is on the demo careers site.`, tone: "success" });
      router.push("/recruiter/jobs");
      // Publishing opened the job, so the recruiter layout's job list (Add candidate's roles) is re-read too.
      // Next's router runs this refresh once the navigation is done; called before the push, it would be dropped.
      router.refresh();
    } catch (error) {
      const problems = fieldErrors(error);
      setServerErrors(problems);
      const message = errorMessage(error, "Couldn't save the demo job. Please try again.");
      setFormError(saved ? `Your changes are saved, but the job isn't published. ${message}` : message);
      setPending(undefined);
      focusFirst(problems);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void save("save");
  }

  return (
    <div className="max-w-3xl pt-1">
      <Link href="/recruiter/jobs" className="mb-4 inline-flex w-fit items-center gap-2 rounded-sm text-sm text-stone transition-colors hover:text-ink">
        <ArrowLeft aria-hidden className="size-4" /> Jobs
      </Link>
      <RecruiterHeader
        title={job ? job.title : "New demo job"}
        subtitle={SUBTITLES[job?.status ?? "new"]}
        actions={
          job && (
            <>
              <DemoJobStatusBadge status={job.status} className="h-7 rounded-[8px] px-2.5" />
              {published && (
                <a href={job.public_path} target="_blank" rel="noopener noreferrer" className={buttonStyles({ variant: "secondary", size: "sm" })}>
                  <ExternalLink aria-hidden /> View public page
                </a>
              )}
            </>
          )
        }
      />

      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-5">
        <Card className="p-5 sm:p-6">
          <h2 className="text-[17px] font-medium tracking-tight text-ink">Basics</h2>
          <p className="mt-1 text-sm text-stone">What the AI writes from. Your notes stay private: they never appear on the careers site.</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Job title" htmlFor={fieldId("title")} error={errors.title} required className="sm:col-span-2">
              <Input {...control("title")} maxLength={200} placeholder="Machine Learning Engineer" autoComplete="off" />
            </Field>
            <Field label="Department" htmlFor={fieldId("department")} error={errors.department}>
              <Input {...control("department")} maxLength={100} placeholder="Engineering" autoComplete="off" />
            </Field>
            <Field label="Location" htmlFor={fieldId("location")} error={errors.location}>
              <Input {...control("location")} maxLength={200} placeholder="City, country" autoComplete="off" />
            </Field>
            <div className="grid gap-4 sm:col-span-2 sm:grid-cols-3">
              <Field label="Work arrangement" htmlFor={fieldId("work_arrangement")} error={errors.work_arrangement}>
                <Select {...control("work_arrangement")} className={values.work_arrangement ? undefined : "text-faint"}>
                  <option value="">Not specified</option>
                  {WORK_ARRANGEMENTS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Employment type" htmlFor={fieldId("employment_type")} error={errors.employment_type}>
                <Select {...control("employment_type")}>
                  {EMPLOYMENT_TYPES.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Seniority" htmlFor={fieldId("seniority")} error={errors.seniority}>
                <Select {...control("seniority")} className={values.seniority ? undefined : "text-faint"}>
                  <option value="">Not specified</option>
                  {SENIORITIES.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Skills" htmlFor={fieldId("skills")} error={errors.skills} className="sm:col-span-2">
              {skills.length > 0 && (
                <ul aria-label="Skills for this job" className="flex flex-wrap gap-2">
                  {skills.map((skill) => (
                    <li
                      key={skill}
                      className="inline-flex items-center gap-1 rounded-full bg-white/[0.05] py-1 pr-1 pl-3 text-[13px] text-charcoal ring-1 ring-white/[0.08]"
                    >
                      {skill}
                      <button
                        type="button"
                        onClick={() => {
                          setSkills((current) => current.filter((item) => item !== skill));
                          clearServerError("skills");
                        }}
                        disabled={generating}
                        aria-label={`Remove ${skill}`}
                        className="rounded-full p-0.5 text-stone transition-colors hover:bg-white/[0.08] hover:text-ink disabled:opacity-50"
                      >
                        <X aria-hidden className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <Input
                id={fieldId("skills")}
                value={skillDraft}
                placeholder={skills.length >= MAX_SKILLS ? "That's as many skills as a posting can list" : "Python, PyTorch, SQL"}
                disabled={skills.length >= MAX_SKILLS}
                autoComplete="off"
                onChange={(event) => {
                  // Everything up to the last comma becomes skills; the rest is still being typed.
                  const text = event.target.value;
                  const comma = text.lastIndexOf(",");
                  if (comma === -1) return setSkillDraft(text);
                  addSkills(text.slice(0, comma));
                  setSkillDraft(text.slice(comma + 1).trimStart());
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    addSkills(skillDraft);
                    setSkillDraft("");
                  }
                }}
                onBlur={() => {
                  addSkills(skillDraft);
                  setSkillDraft("");
                }}
                aria-invalid={errors.skills ? true : undefined}
                aria-describedby={describedBy("skills", true)}
              />
              <Hint field="skills">Separate skills with commas, or press Enter after each one.</Hint>
            </Field>
            <Field label="Short notes" htmlFor={fieldId("notes")} error={errors.notes} className="sm:col-span-2">
              <Textarea
                {...control("notes", { hint: true })}
                rows={3}
                maxLength={MAX_NOTES}
                placeholder="What the team works on, what makes the role distinct, anything the posting should mention."
                className={cn(growing, "min-h-20")}
              />
              <Hint field="notes">For the AI only. Never shown on the careers site.</Hint>
            </Field>
          </div>

          <div className="mt-5 flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center">
            <Button variant="ai" onClick={requestDraft} disabled={busy} className="self-start sm:self-auto">
              {generating ? <LoaderCircle className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
              {generating ? "Writing a draft…" : "Generate with AI"}
            </Button>
            <div aria-live="polite" className="min-w-0 text-sm text-stone">
              {generating ? (
                <p>Writing a draft…</p>
              ) : aiError ? (
                <p className="text-red-300">{aiError}</p>
              ) : generatedBy ? (
                <p>
                  {draftSource(generatedBy)}
                  {removed > 0 && ` ${removedNote(removed)}`}
                </p>
              ) : (
                <p>Drafts the posting below from these basics. Nothing is saved until you save it.</p>
              )}
            </div>
          </div>
        </Card>

        <Card aria-busy={generating || undefined} className={cn("p-5 transition-opacity sm:p-6", generating && "opacity-60")}>
          <h2 className="text-[17px] font-medium tracking-tight text-ink">Posting</h2>
          <p className="mt-1 text-sm text-stone">
            What candidates read on the demo careers site. To publish it, add a summary, what the role is about, and at least one
            responsibility and one requirement.
          </p>
          <p className="mt-4 flex items-start gap-2.5 rounded-[12px] bg-ai/[0.08] px-3.5 py-2.5 text-sm text-violet-100 ring-1 ring-ai/20">
            <Sparkles aria-hidden className="mt-0.5 size-4 shrink-0 text-ai" />
            AI drafts are a starting point: review and edit everything. Nothing is published until you click Publish Demo Job.
          </p>
          <div className="mt-5 grid gap-4">
            <Field label="Summary" htmlFor={fieldId("summary")} error={errors.summary}>
              <Textarea {...control("summary", { hint: true })} rows={2} maxLength={MAX_SUMMARY} className={cn(growing, "min-h-16")} />
              <Hint field="summary">One or two sentences: the first thing candidates read.</Hint>
            </Field>
            <Field label="About the role" htmlFor={fieldId("about_role")} error={errors.about_role}>
              <Textarea {...control("about_role")} rows={5} maxLength={MAX_ABOUT_ROLE} className={cn(growing, "min-h-32")} />
            </Field>
            <Field label="Responsibilities" htmlFor={fieldId("responsibilities")} error={errors.responsibilities}>
              <Textarea {...control("responsibilities", { hint: true })} rows={5} className={cn(growing, "min-h-32")} />
              <Hint field="responsibilities">One per line.</Hint>
            </Field>
            <Field label="Requirements" htmlFor={fieldId("requirements")} error={errors.requirements}>
              <Textarea {...control("requirements", { hint: true })} rows={5} className={cn(growing, "min-h-32")} />
              <Hint field="requirements">One per line. Job-related skills, knowledge and experience only.</Hint>
            </Field>
            <Field label="Preferred qualifications" htmlFor={fieldId("preferred_qualifications")} error={errors.preferred_qualifications}>
              <Textarea {...control("preferred_qualifications", { hint: true })} rows={3} className={cn(growing, "min-h-20")} />
              <Hint field="preferred_qualifications">One per line. Nice to have, never required.</Hint>
            </Field>
            <Field label="About the team" htmlFor={fieldId("about_team")} error={errors.about_team}>
              <Textarea {...control("about_team")} rows={3} maxLength={MAX_ABOUT_TEAM} className={cn(growing, "min-h-20")} />
            </Field>
          </div>
        </Card>

        {formError && (
          <p role="alert" className="rounded-[10px] border border-red-400/20 bg-red-400/[0.06] px-3 py-2.5 text-sm text-red-100">
            {formError}
          </p>
        )}

        <div className="flex flex-col-reverse gap-2 border-t border-border pt-5 sm:flex-row sm:justify-end">
          <Button type="submit" variant={published ? "primary" : "secondary"} disabled={busy}>
            {pending === "save" && <LoaderCircle className="animate-spin" aria-hidden />}
            {pending === "save" ? "Saving…" : !job || job.status === "draft" ? "Save Draft" : "Save changes"}
          </Button>
          {!published && (
            <Button onClick={() => void save("publish")} disabled={busy}>
              {pending === "publish" ? <LoaderCircle className="animate-spin" aria-hidden /> : <Globe aria-hidden />}
              {pending === "publish" ? "Publishing…" : "Publish Demo Job"}
            </Button>
          )}
        </div>
      </form>

      <Modal
        open={confirmReplace}
        onClose={() => setConfirmReplace(false)}
        title="Replace the posting text?"
        description="The AI writes a new summary, role description, lists and team section from the basics, replacing what's in those fields now. Your skills are kept."
      >
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => setConfirmReplace(false)}>
            Keep my text
          </Button>
          <Button
            variant="ai"
            onClick={() => {
              setConfirmReplace(false);
              void generate();
            }}
          >
            <Sparkles aria-hidden /> Write a new draft
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function Hint({ field, children }: { field: FieldKey; children: ReactNode }) {
  return (
    <p id={hintId(field)} className="text-xs text-faint">
      {children}
    </p>
  );
}

const fieldId = (key: FieldKey) => `demo-job-${key}`;
const hintId = (key: FieldKey) => `${fieldId(key)}-hint`;

function toValues(job?: DemoJob): FormValues {
  return {
    title: job?.title ?? "",
    department: job?.department ?? "",
    location: job?.location ?? "",
    work_arrangement: job?.work_arrangement ?? "",
    employment_type: job?.employment_type ?? "Full-time",
    seniority: job?.seniority ?? "",
    notes: job?.notes ?? "",
    summary: job?.summary ?? "",
    about_role: job?.about_role ?? "",
    responsibilities: (job?.responsibilities ?? []).join("\n"),
    requirements: (job?.requirements ?? []).join("\n"),
    preferred_qualifications: (job?.preferred_qualifications ?? []).join("\n"),
    about_team: job?.about_team ?? "",
  };
}

function fromDraft(draft: JobPostingContent): Pick<FormValues, (typeof POSTING_KEYS)[number]> {
  return {
    summary: draft.summary,
    about_role: draft.about_role,
    responsibilities: draft.responsibilities.join("\n"),
    requirements: draft.requirements.join("\n"),
    preferred_qualifications: draft.preferred_qualifications.join("\n"),
    about_team: draft.about_team ?? "",
  };
}

const optional = (text: string) => text.trim() || null;

function toPosting(values: FormValues, skills: string[]): DemoJobCreate {
  return {
    title: values.title.trim(),
    department: optional(values.department),
    location: optional(values.location),
    work_arrangement: (values.work_arrangement || null) as WorkArrangement | null,
    employment_type: values.employment_type as EmploymentType,
    seniority: (values.seniority || null) as Seniority | null,
    skills,
    notes: optional(values.notes),
    summary: optional(values.summary),
    about_role: optional(values.about_role),
    responsibilities: parseLines(values.responsibilities),
    requirements: parseLines(values.requirements),
    preferred_qualifications: parseLines(values.preferred_qualifications),
    about_team: optional(values.about_team),
  };
}

function toBrief(values: FormValues, skills: string[]): JobPostingBrief {
  const { title, department, location, work_arrangement, employment_type, seniority, notes } = toPosting(values, skills);
  return { title, department, location, work_arrangement, employment_type, seniority, skills, notes };
}

/** Trimmed, inner whitespace collapsed, blanks and repeats (ignoring case) dropped, as the API keeps them. */
function cleanList(items: string[]): string[] {
  const seen = new Set<string>();
  return items.flatMap((item) => {
    const text = item.replace(/\s+/g, " ").trim();
    if (!text || seen.has(text.toLowerCase())) return [];
    seen.add(text.toLowerCase());
    return [text];
  });
}

/** One item per line. A bullet or number pasted in front of a line is dropped. */
function parseLines(text: string): string[] {
  return cleanList(text.split("\n").map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "")));
}

type Check = "brief" | "save" | "publish";

/** A published posting must stay complete, so saving one checks what publishing does. */
function checkFor(attempt: Pending, published: boolean): Check {
  if (attempt === "generate") return "brief";
  return attempt === "publish" || published ? "publish" : "save";
}

/** brief: what the AI job writer needs. save: also the lists' limits. publish: also a complete posting, as the API requires. */
function validate(values: FormValues, check: Check): Errors {
  const errors: Errors = {};
  if (!values.title.trim()) errors.title = check === "brief" ? "Add a job title first: the AI writes from it." : "Add a job title.";
  if (check === "brief") return errors;
  for (const key of LIST_KEYS) {
    const items = parseLines(values[key]);
    const long = items.findIndex((item) => item.length > MAX_ITEM);
    if (items.length > MAX_ITEMS) errors[key] = `List up to ${MAX_ITEMS} items, one per line.`;
    else if (long !== -1) errors[key] = `Item ${long + 1} is longer than ${MAX_ITEM} characters.`;
  }
  if (check === "publish") {
    if (!values.summary.trim()) errors.summary = "Add a summary.";
    if (!values.about_role.trim()) errors.about_role = "Describe the role.";
    if (!errors.responsibilities && parseLines(values.responsibilities).length === 0) {
      errors.responsibilities = "Add at least one responsibility.";
    }
    if (!errors.requirements && parseLines(values.requirements).length === 0) errors.requirements = "Add at least one requirement.";
  }
  return errors;
}

function hasErrors(errors: Errors): boolean {
  return Object.keys(errors).length > 0;
}

/** The API's 422 details ([{field, message}]) on the matching fields: "requirements.2" is the third requirement. */
function fieldErrors(error: unknown): Errors {
  const errors: Errors = {};
  if (!(error instanceof ApiError) || error.status !== 422 || !Array.isArray(error.details)) return errors;
  for (const detail of error.details as ({ field?: unknown; message?: unknown } | null)[]) {
    if (typeof detail?.field !== "string" || typeof detail.message !== "string") continue;
    const [name, index] = detail.field.split(".");
    const key = FIELD_ORDER.find((field) => field === name);
    if (!key || errors[key]) continue;
    errors[key] = index && /^\d+$/.test(index) ? `${key === "skills" ? "Skill" : "Item"} ${Number(index) + 1}: ${detail.message}` : detail.message;
  }
  return errors;
}

/** Moves focus to the first field with a problem, once its error is on screen. */
function focusFirst(errors: Errors) {
  const key = FIELD_ORDER.find((field) => errors[field]);
  if (key) requestAnimationFrame(() => document.getElementById(fieldId(key))?.focus());
}

/** Who wrote the draft. "mock (fallback from groq)" means the AI service failed and the API used its template writer. */
function draftSource(model: string): string {
  const failed = /^mock \(fallback from (.+)\)$/.exec(model)?.[1];
  if (failed) return `The AI service (${failed}) was unavailable, so this draft comes from a template.`;
  if (model === "mock") return "No AI model is set up, so this draft comes from a template.";
  return `Drafted by ${model}.`;
}

function removedNote(removed: number): string {
  const one = removed === 1;
  return `${pluralize(removed, "line")} ${one ? "was" : "were"} left out because ${one ? "it" : "they"} referred to personal characteristics.`;
}
