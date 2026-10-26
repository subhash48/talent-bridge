"use client";

import { BriefcaseBusiness, Check, ExternalLink, LoaderCircle, Pencil, TriangleAlert, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { Chips, Frame, Superseded } from "@/components/recruiter/assistant/CardFrame";
import { Button, buttonStyles } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { formatSalary } from "@/lib/format";
import { errorMessage } from "@/services/api";
import type { EmploymentType, JobDraft, JobDraftCard, Seniority, WorkArrangement } from "@/types/assistant";

const ARRANGEMENTS: WorkArrangement[] = ["On-site", "Hybrid", "Remote"];
const EMPLOYMENT: EmploymentType[] = ["Full-time", "Part-time", "Contract", "Internship", "Temporary"];
const LEVELS: Seniority[] = ["Internship", "Entry Level", "Mid Level", "Senior", "Staff", "Principal", "Manager", "Director"];

type JobDraftReviewProps = {
  card: JobDraftCard;
  onApprove: (actionId: string, draft: JobDraft) => Promise<unknown>;
  onCancel: (actionId: string) => Promise<unknown>;
  /** The recruiter edited the draft: reported so a typed or spoken "approve" creates it as it is now. */
  onEdits?: (actionId: string, draft: JobDraft) => void;
  superseded?: boolean;
};

const lines = (text: string) => text.split("\n").map((line) => line.replace(/^\s*[-•]\s*/, "").trim()).filter(Boolean);
const skillList = (text: string) => text.split(",").map((skill) => skill.trim()).filter(Boolean);

/**
 * "AI Job Draft": the job the assistant drafted from what the recruiter said, every field there to check
 * and edit, with what they didn't say flagged rather than invented. Nothing exists until Approve & Create.
 */
export function JobDraftReview({ card, onApprove, onCancel, onEdits, superseded = false }: JobDraftReviewProps) {
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<JobDraft>(card.draft);
  // The skills as typed; the draft holds them as a list, so the card shows what will be created.
  const [skills, setSkills] = useState(card.draft.skills.join(", "));
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string>();
  const edited = useRef(false);
  const open = card.status === "proposed";
  const live = open && !superseded;
  useEffect(() => {
    if (edited.current && live) onEdits?.(card.action_id, { ...draft, title: draft.title.trim() });
  }, [draft, live, card.action_id, onEdits]);

  if (superseded) return <Superseded label={`AI Job Draft · ${card.draft.title}`} />;

  const created = card.stage === "created";
  // Once it's handled, the card shows what the server has, not this copy's edits.
  const job = open ? draft : card.draft;
  const salary = formatSalary(job.salary_min, job.salary_max, job.salary_currency);
  const set = <K extends keyof JobDraft>(key: K, value: JobDraft[K]) => {
    edited.current = true;
    setDraft((current) => ({ ...current, [key]: value }));
  };

  async function approve() {
    if (saving || !draft.title.trim()) return;
    setSaving(true);
    setProblem(undefined);
    try {
      await onApprove(card.action_id, { ...draft, title: draft.title.trim() });
    } catch (error) {
      setProblem(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  const label = created
    ? "Job created"
    : card.status === "cancelled"
      ? "Cancelled · no job was created"
      : card.status === "failed"
        ? "Couldn't create the job"
        : card.stage === "confirm"
          ? "Create this job?"
          : "AI Job Draft · not a job yet";

  return (
    <Frame label={label} tone={created ? "done" : card.status === "failed" ? "failed" : "neutral"}>
      {editing && open ? (
        <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
          <Field id={`${id}-title`} label="Job title" className="sm:col-span-2">
            <Input id={`${id}-title`} value={draft.title} maxLength={200} onChange={(event) => set("title", event.target.value)} />
          </Field>
          <Field id={`${id}-department`} label="Department">
            <Input id={`${id}-department`} value={draft.department ?? ""} maxLength={100} onChange={(event) => set("department", event.target.value || null)} />
          </Field>
          <Field id={`${id}-location`} label="Location">
            <Input id={`${id}-location`} value={draft.location ?? ""} maxLength={200} onChange={(event) => set("location", event.target.value || null)} />
          </Field>
          <Field id={`${id}-arrangement`} label="Work arrangement">
            <Select id={`${id}-arrangement`} value={draft.work_arrangement ?? ""} onChange={(event) => set("work_arrangement", (event.target.value || null) as WorkArrangement | null)}>
              <option value="">Not given</option>
              {ARRANGEMENTS.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </Select>
          </Field>
          <Field id={`${id}-type`} label="Employment type">
            <Select id={`${id}-type`} value={draft.employment_type} onChange={(event) => set("employment_type", event.target.value as EmploymentType)}>
              {EMPLOYMENT.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </Select>
          </Field>
          <Field id={`${id}-level`} label="Seniority">
            <Select id={`${id}-level`} value={draft.seniority ?? ""} onChange={(event) => set("seniority", (event.target.value || null) as Seniority | null)}>
              <option value="">Not given</option>
              {LEVELS.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </Select>
          </Field>
          <Field id={`${id}-salary`} label={`Salary range (${draft.salary_currency}, yearly)`}>
            <div className="flex items-center gap-2">
              <Input
                id={`${id}-salary`}
                type="number"
                min={1}
                placeholder="From"
                aria-label="Salary from"
                value={draft.salary_min ?? ""}
                onChange={(event) => set("salary_min", event.target.value ? Number(event.target.value) : null)}
              />
              <Input
                type="number"
                min={1}
                placeholder="To"
                aria-label="Salary to"
                value={draft.salary_max ?? ""}
                onChange={(event) => set("salary_max", event.target.value ? Number(event.target.value) : null)}
              />
            </div>
          </Field>
          <Field id={`${id}-skills`} label="Skills (comma-separated)" className="sm:col-span-2">
            <Input
              id={`${id}-skills`}
              value={skills}
              onChange={(event) => {
                setSkills(event.target.value);
                set("skills", skillList(event.target.value));
              }}
            />
          </Field>
          <Field id={`${id}-summary`} label="Summary" className="sm:col-span-2">
            <Textarea id={`${id}-summary`} value={draft.summary ?? ""} maxLength={600} onChange={(event) => set("summary", event.target.value || null)} className="field-sizing-content min-h-16 text-[13px]" />
          </Field>
          <Field id={`${id}-description`} label="Job description" className="sm:col-span-2">
            <Textarea id={`${id}-description`} value={draft.description ?? ""} maxLength={3000} onChange={(event) => set("description", event.target.value || null)} className="field-sizing-content min-h-24 text-[13px]" />
          </Field>
          {(
            [
              ["responsibilities", "Responsibilities (one per line)"],
              ["requirements", "Requirements (one per line)"],
              ["preferred_qualifications", "Preferred qualifications (one per line)"],
            ] as const
          ).map(([key, title]) => (
            <Field key={key} id={`${id}-${key}`} label={title} className="sm:col-span-2">
              <Textarea
                id={`${id}-${key}`}
                defaultValue={draft[key].join("\n")}
                onChange={(event) => set(key, lines(event.target.value).slice(0, 12))}
                className="field-sizing-content min-h-20 text-[13px]"
              />
            </Field>
          ))}
        </div>
      ) : (
        <>
          <p className="mt-2 text-[15px] font-semibold tracking-tight text-ink">{job.title}</p>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3">
            <Fact label="Department" value={job.department} />
            <Fact label="Location" value={job.location} />
            <Fact label="Work arrangement" value={job.work_arrangement} />
            <Fact label="Employment type" value={job.employment_type} />
            <Fact label="Seniority" value={job.seniority} />
            <Fact label="Salary" value={salary} />
          </dl>
          <Chips items={job.skills} />
          {job.summary && <p className="mt-3 text-[13px] leading-relaxed text-charcoal">{job.summary}</p>}
          {job.description && <p className="mt-2 text-[13px] leading-relaxed text-stone">{job.description}</p>}
          <Bullets title="Responsibilities" items={job.responsibilities} />
          <Bullets title="Requirements" items={job.requirements} />
          <Bullets title="Preferred qualifications" items={job.preferred_qualifications} />
        </>
      )}

      {card.changes.length > 0 && open && (
        <ul className="mt-3 flex flex-col gap-1 text-xs text-charcoal">
          {card.changes.map((change) => (
            <li key={change} className="flex items-center gap-1.5">
              <Check aria-hidden className="size-3 text-sage" /> {change}
            </li>
          ))}
        </ul>
      )}
      {card.missing.length > 0 && open && (
        <ul aria-label="Check before creating" className="mt-3 flex flex-col gap-1 rounded-[8px] bg-caution/[0.06] px-3 py-2 text-xs text-caution ring-1 ring-caution/15">
          {card.missing.map((note) => (
            <li key={note} className="flex items-center gap-1.5">
              <TriangleAlert aria-hidden className="size-3 shrink-0" /> {note}
            </li>
          ))}
        </ul>
      )}
      {open && <p className="mt-2 text-[11px] text-faint">Approve &amp; Create opens it on your careers site. Nothing exists until then.</p>}
      {(problem || card.error) && <p className="mt-2 text-xs text-danger">{problem ?? card.error}</p>}

      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        {open ? (
          <>
            <Button variant="ghost" size="sm" disabled={saving} onClick={() => void onCancel(card.action_id)}>
              <X aria-hidden /> Cancel
            </Button>
            <Button variant="secondary" size="sm" disabled={saving} onClick={() => setEditing((value) => !value)}>
              <Pencil aria-hidden /> {editing ? "Done editing" : "Edit"}
            </Button>
            <Button size="sm" disabled={saving || !draft.title.trim()} onClick={() => void approve()}>
              {saving ? <LoaderCircle aria-hidden className="animate-spin" /> : <Check aria-hidden />}
              {saving ? "Creating…" : "Approve & Create"}
            </Button>
          </>
        ) : (
          created &&
          card.job_href && (
            <>
              <Link href={card.job_href} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                <BriefcaseBusiness aria-hidden /> Open the job
              </Link>
              {card.careers_href && (
                <a href={card.careers_href} target="_blank" rel="noopener noreferrer" className={buttonStyles({ variant: "secondary", size: "sm" })}>
                  <ExternalLink aria-hidden /> Careers page
                </a>
              )}
            </>
          )
        )}
      </div>
    </Frame>
  );
}

function Field({ id, label, className, children }: { id: string; label: string; className?: string; children: ReactNode }) {
  return (
    <div className={`flex flex-col gap-1 ${className ?? ""}`}>
      <label htmlFor={id} className="text-xs text-stone">
        {label}
      </label>
      {children}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-0">
      <dt className="text-faint">{label}</dt>
      <dd className={value ? "truncate text-charcoal" : "text-caution"}>{value ?? "Not given"}</dd>
    </div>
  );
}

function Bullets({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="mt-3">
      <p className="text-xs font-medium text-ink">{title}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[13px] text-charcoal">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
