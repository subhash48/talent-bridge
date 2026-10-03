"use client";

import { FileText, LoaderCircle, Lock, X } from "lucide-react";
import { useId, useState, type FormEvent } from "react";

import { useCandidatePortal } from "@/components/candidate/CandidatePortalProvider";
import { CandidateHeader } from "@/components/candidate/CandidateHeader";
import { LoadError } from "@/components/candidate/LoadError";
import { Avatar } from "@/components/shared/Avatar";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toaster";
import { useLiveQuery } from "@/hooks/useLiveQuery";
import { errorMessage } from "@/services/api";
import { getCandidateProfile, updateCandidateProfile } from "@/services/portal";
import type { CandidateProfile } from "@/types/portal";

const MAX_SKILLS = 30;

export function ProfileView({ initialProfile }: { initialProfile?: CandidateProfile }) {
  // Refetches rarely, and never reset the form: its fields are local state compared against this.
  const { data: profile, error, refresh, setData } = useLiveQuery(getCandidateProfile, {
    initialData: initialProfile,
    intervalMs: 10 * 60_000,
  });

  return (
    <>
      <CandidateHeader title="Profile" subtitle="Keep your contact details up to date. Your recruiter sees changes straight away." />
      {profile ? (
        <ProfileForm key={profile.id} profile={profile} onSaved={(saved) => setData(() => saved)} />
      ) : error ? (
        <LoadError title="Your profile couldn't load" message={error} onRetry={() => void refresh()} />
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]" aria-busy="true" aria-label="Loading your profile">
          <Skeleton className="h-[520px] rounded-[18px]" />
          <Skeleton className="h-[260px] rounded-[18px]" />
        </div>
      )}
    </>
  );
}

function ProfileForm({ profile, onSaved }: { profile: CandidateProfile; onSaved: (profile: CandidateProfile) => void }) {
  const { update } = useCandidatePortal();
  const toast = useToast();
  const id = useId();
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [location, setLocation] = useState(profile.location ?? "");
  const [headline, setHeadline] = useState(profile.headline ?? "");
  const [skills, setSkills] = useState(profile.skills);
  const [skillDraft, setSkillDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const changes = {
    ...(phone.trim() !== (profile.phone ?? "") && { phone: phone.trim() || null }),
    ...(location.trim() !== (profile.location ?? "") && { location: location.trim() || null }),
    ...(headline.trim() !== (profile.headline ?? "") && { headline: headline.trim() || null }),
    ...(skills.join("\n") !== profile.skills.join("\n") && { skills }),
  };
  const dirty = Object.keys(changes).length > 0;

  function addSkill(raw: string) {
    const skill = raw.trim().replace(/,$/, "").trim();
    if (!skill || skills.length >= MAX_SKILLS || skills.some((item) => item.toLowerCase() === skill.toLowerCase())) return;
    setSkills([...skills, skill.slice(0, 60)]);
    setSkillDraft("");
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!dirty || saving) return;
    setSaving(true);
    try {
      const saved = await updateCandidateProfile(changes);
      onSaved(saved);
      update((me) => ({ ...me, candidate: saved }));
      toast({ title: "Profile updated", description: "Your recruiter can see your new details.", tone: "success" });
    } catch (error) {
      toast({ title: "Couldn't save your profile", description: errorMessage(error), tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setPhone(profile.phone ?? "");
    setLocation(profile.location ?? "");
    setHeadline(profile.headline ?? "");
    setSkills(profile.skills);
    setSkillDraft("");
  }

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <form onSubmit={(event) => void save(event)}>
        <Card className="p-5 sm:p-6">
          <h2 className="font-semibold tracking-tight text-ink">Contact details</h2>
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Phone" htmlFor={`${id}-phone`}>
              <Input id={`${id}-phone`} type="tel" autoComplete="tel" maxLength={40} value={phone} onChange={(event) => setPhone(event.target.value)} />
            </Field>
            <Field label="Location" htmlFor={`${id}-location`}>
              <Input
                id={`${id}-location`}
                autoComplete="address-level2"
                maxLength={200}
                placeholder="City, country"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
              />
            </Field>
            <Field label="Headline" htmlFor={`${id}-headline`} className="sm:col-span-2">
              <Textarea
                id={`${id}-headline`}
                rows={2}
                maxLength={300}
                placeholder="A one-line summary of what you do"
                value={headline}
                onChange={(event) => setHeadline(event.target.value)}
              />
            </Field>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <label htmlFor={`${id}-skills`} className="text-xs font-medium text-charcoal">
                Skills
              </label>
              {skills.length > 0 && (
                <ul className="flex flex-wrap gap-2" aria-label="Your skills">
                  {skills.map((skill) => (
                    <li key={skill} className="inline-flex items-center gap-1 rounded-full bg-white/[0.05] py-1 pr-1 pl-3 text-[13px] text-charcoal ring-1 ring-white/[0.08]">
                      {skill}
                      <button
                        type="button"
                        onClick={() => setSkills(skills.filter((item) => item !== skill))}
                        aria-label={`Remove ${skill}`}
                        className="rounded-full p-0.5 text-stone transition-colors hover:bg-white/[0.08] hover:text-ink"
                      >
                        <X aria-hidden className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <Input
                id={`${id}-skills`}
                value={skillDraft}
                maxLength={61}
                placeholder={skills.length >= MAX_SKILLS ? "You've added the maximum number of skills" : "Add a skill and press Enter"}
                disabled={skills.length >= MAX_SKILLS}
                onChange={(event) => {
                  if (event.target.value.endsWith(",")) addSkill(event.target.value);
                  else setSkillDraft(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addSkill(skillDraft);
                  }
                }}
                onBlur={() => addSkill(skillDraft)}
              />
            </div>
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-end gap-2 border-t border-border pt-5">
            <Button variant="ghost" onClick={reset} disabled={!dirty || saving}>
              Discard changes
            </Button>
            <Button type="submit" disabled={!dirty || saving}>
              {saving && <LoaderCircle className="animate-spin" />}
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </Card>
      </form>

      <div className="flex flex-col gap-5">
        <Card className="p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <Avatar name={profile.fullName} src={profile.avatarUrl} size={48} />
            <div className="min-w-0">
              <p className="truncate font-semibold text-ink">{profile.fullName}</p>
              {profile.pronouns && <p className="text-[13px] text-stone">{profile.pronouns}</p>}
            </div>
          </div>
          <dl className="mt-5 flex flex-col gap-3 text-sm">
            <div>
              <dt className="text-xs text-faint">Email</dt>
              <dd className="mt-0.5 truncate text-charcoal">{profile.email}</dd>
            </div>
          </dl>
          <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-faint">
            <Lock aria-hidden className="mt-px size-3.5 shrink-0" />
            To change your name or email, message your recruiter.
          </p>
        </Card>

        <Card className="p-5 sm:p-6">
          <h2 className="font-semibold tracking-tight text-ink">Resume</h2>
          {profile.resumeUrl ? (
            <a
              href={profile.resumeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 flex items-center gap-3 rounded-[12px] bg-white/[0.04] px-3.5 py-3 text-sm text-charcoal ring-1 ring-white/[0.08] transition-colors hover:text-ink"
            >
              <FileText aria-hidden className="size-4 text-stone" /> View your resume
            </a>
          ) : (
            <p className="mt-3 text-sm text-stone">No resume on file. Your recruiter can add one for you.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
