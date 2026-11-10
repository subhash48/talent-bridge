"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { CheckCircle2, LoaderCircle } from "lucide-react";

import { ApplyProblemAlert, type ApplyProblem } from "@/components/careers/ApplyProblemAlert";
import { AvailabilityFieldset, fieldErrorsFrom, linkedInUrl, LINKEDIN_PROBLEM, NO_ZOOM, phoneProblem, problemFrom } from "@/components/careers/applyFields";
import { ResumeInput, readResume, resumeProblem } from "@/components/careers/ResumeInput";
import { Button, buttonStyles } from "@/components/ui/Button";
import { Field, fieldErrorId } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { WEEKDAYS, type Weekday } from "@/lib/days";
import { applyAsCandidate } from "@/services/careers";
import type { CandidateApplyResult, CareerJobDetail } from "@/types/careers";
import type { CandidateProfile } from "@/types/portal";

type FieldName = "phone" | "linkedinUrl" | "experienceNote" | "availability" | "resume";
const API_FIELDS: Record<string, FieldName> = { phone: "phone", linkedin_url: "linkedinUrl", experience_note: "experienceNote", availability: "availability", resume: "resume" };

/** Who is applying: their name and email from the account, and the phone on file when the profile could be read. */
export type Applicant = Pick<CandidateProfile, "fullName" | "email" | "phone">;

export function CandidateApplyForm({ job, candidate }: { job: CareerJobDetail; candidate: Applicant }) {
  const [phone, setPhone] = useState(candidate.phone ?? "");
  const [linkedin, setLinkedin] = useState("");
  const [experience, setExperience] = useState("");
  const [days, setDays] = useState<Weekday[]>([]);
  const [resume, setResume] = useState<File | null>(null);
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [problem, setProblem] = useState<ApplyProblem | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<CandidateApplyResult | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const busy = useRef(false);
  const confirmation = useRef<HTMLDivElement>(null);

  useEffect(() => { if (result) confirmation.current?.focus(); }, [result]);
  useEffect(() => {
    if (Object.keys(errors).length) form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [errors]);

  function control(field: FieldName) {
    return { id: `candidate-apply-${field}`, "aria-invalid": errors[field] ? true as const : undefined,
      "aria-describedby": errors[field] ? fieldErrorId(`candidate-apply-${field}`) : undefined };
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    const invalid: Partial<Record<FieldName, string>> = {};
    const phoneError = phoneProblem(phone, false);
    if (phoneError) invalid.phone = phoneError;
    if (linkedin.trim() && !linkedInUrl(linkedin)) invalid.linkedinUrl = LINKEDIN_PROBLEM;
    if (job.workDays.length && !days.length) invalid.availability = "Choose the days you can work.";
    const resumeError = resume ? resumeProblem(resume) : "Attach your résumé.";
    if (resumeError) invalid.resume = resumeError;
    setErrors(invalid);
    setProblem(null);
    if (!resume || Object.keys(invalid).length) return;
    busy.current = true;
    setPending(true);
    try {
      let upload;
      try { upload = await readResume(resume); }
      catch { setErrors({ resume: "We couldn't read that file. Choose it again." }); return; }
      setResult(await applyAsCandidate(job.id, {
        phone: phone.trim(), linkedinUrl: linkedInUrl(linkedin), experienceNote: experience.trim() || null,
        availability: WEEKDAYS.filter((day) => days.includes(day)), resume: upload,
      }));
    } catch (error) {
      const { fields, complete } = fieldErrorsFrom(error, API_FIELDS, (field) => field !== "availability" || job.workDays.length > 0);
      setErrors(fields);
      if (!complete) setProblem(problemFrom(error, "native"));
    } finally { busy.current = false; setPending(false); }
  }

  if (result) return (
    <div ref={confirmation} tabIndex={-1} className="sky-card rounded-[20px] p-6 sm:p-8" role="status">
      <CheckCircle2 aria-hidden className="size-8 text-brand-ink" />
      <h2 className="mt-4 text-2xl font-semibold text-ink">{result.status === "submitted" ? "Application sent" : "You've already applied"}</h2>
      <p className="mt-3 text-charcoal">Your application for {result.jobTitle} at {result.company} is in your candidate portal.</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/candidate/applications" className={buttonStyles({ size: "lg" })}>View your applications</Link>
        <Link href="/jobs" className={buttonStyles({ variant: "secondary", size: "lg" })}>Browse more jobs</Link>
      </div>
    </div>
  );

  return (
    <form ref={form} noValidate onSubmit={(event) => void submit(event)} className="sky-card rounded-[20px] p-5 sm:p-7">
      <h2 className="font-semibold text-ink">Applying as {candidate.fullName}</h2>
      <p className="mt-1 break-all text-sm text-charcoal">{candidate.email}</p>
      <fieldset disabled={pending} className="mt-6 flex min-w-0 flex-col gap-5">
        <Field htmlFor="candidate-apply-phone" label="Phone number (optional)" error={errors.phone}>
          <Input {...control("phone")} type="tel" autoComplete="tel" maxLength={40} value={phone} onChange={(e) => setPhone(e.target.value)} className={NO_ZOOM} />
        </Field>
        <Field htmlFor="candidate-apply-linkedinUrl" label="LinkedIn URL (optional)" error={errors.linkedinUrl}>
          <Input {...control("linkedinUrl")} type="url" maxLength={2000} placeholder="linkedin.com/in/your-name" value={linkedin} onChange={(e) => setLinkedin(e.target.value)} className={NO_ZOOM} />
        </Field>
        {job.workDays.length > 0 && <AvailabilityFieldset id="candidate-apply-availability" days={job.workDays} chosen={days}
          onToggle={(day) => setDays((current) => current.includes(day) ? current.filter((value) => value !== day) : [...current, day])} error={errors.availability} disabled={pending} />}
        <Field htmlFor="candidate-apply-experienceNote" label="Your relevant experience (optional)" error={errors.experienceNote}>
          <Textarea {...control("experienceNote")} rows={3} maxLength={2000} value={experience} onChange={(e) => setExperience(e.target.value)} className={NO_ZOOM} />
        </Field>
        <Field htmlFor="candidate-apply-resume" label="Résumé" required error={errors.resume}>
          <ResumeInput id="candidate-apply-resume" file={resume} onChange={setResume} error={errors.resume} disabled={pending} />
        </Field>
      </fieldset>
      <p className="mt-5 text-xs leading-relaxed text-stone">Your answers and résumé will be shared with this job&apos;s hiring team.</p>
      {problem && <div className="mt-5"><ApplyProblemAlert problem={problem} site="native" /></div>}
      <Button type="submit" size="lg" disabled={pending || problem?.roleGone} className="mt-6 w-full sm:w-auto">
        {pending && <LoaderCircle aria-hidden className="size-4 motion-safe:animate-spin" />}{pending ? "Sending…" : "Submit application"}
      </Button>
    </form>
  );
}
