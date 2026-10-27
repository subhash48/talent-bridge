"use client";

import { BriefcaseBusiness, LoaderCircle, Store } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { AuthAlert } from "@/components/auth/AuthAlert";
import { authLinkStyles } from "@/components/auth/AuthCard";
import { Button } from "@/components/ui/Button";
import { Field, fieldErrorId } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { homePath } from "@/lib/auth";
import { createClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { ApiError, errorMessage } from "@/services/api";
import { createWorkspace, getAccountStatus } from "@/services/accounts";
import { getCurrentUser } from "@/services/me";
import type { WorkspaceMode } from "@/types/workspace";

export const MODES: { value: WorkspaceMode; who: string; title: string; text: string; icon: typeof Store }[] = [
  {
    value: "full",
    who: "Recruiting team / growing company",
    title: "Full Recruiting Workspace",
    text: "For recruiting teams and growing companies.",
    icon: BriefcaseBusiness,
  },
  {
    value: "simple",
    who: "Small business / simple hiring",
    title: "Simple Hire",
    text: "For small businesses that just want to post jobs and contact applicants.",
    icon: Store,
  },
];

type Loaded =
  | { kind: "loading" }
  | { kind: "ready"; name: string }
  | { kind: "blocked"; message: string; href: string; link: string };

/**
 * Setting up an employer's workspace, once their email is verified: how they hire, the company's name and
 * where it is. They become its admin; the mode can be changed later in its settings.
 */
export function WorkspaceSetupForm({ initialMode }: { initialMode: WorkspaceMode | null }) {
  const [loaded, setLoaded] = useState<Loaded>({ kind: "loading" });
  const [mode, setMode] = useState<WorkspaceMode | null>(initialMode);
  const [company, setCompany] = useState("");
  const [location, setLocation] = useState("");
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      try {
        const status = await getAccountStatus();
        if (status.account === "staff") {
          window.location.replace(homePath(await getCurrentUser()));
          return;
        }
        if (status.account === "candidate") {
          return setLoaded({
            kind: "blocked",
            message: "This sign-in is a candidate account. Set up your company with your work email instead.",
            href: "/candidate",
            link: "Open your candidate portal",
          });
        }
        if (!status.emailVerified) {
          return setLoaded({
            kind: "blocked",
            message: "Verify your email first: open the link we sent you, then come back here.",
            href: "/login?as=employer",
            link: "Back to sign in",
          });
        }
        const { data } = await createClient().auth.getUser();
        const meta = data.user?.user_metadata ?? {};
        const said = typeof meta.full_name === "string" ? meta.full_name.trim() : "";
        if (!initialMode && (meta.hire_mode === "simple" || meta.hire_mode === "full")) setMode(meta.hire_mode);
        setName(said);
        setLoaded({ kind: "ready", name: said });
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 401) {
          return setLoaded({
            kind: "blocked",
            message: "Your sign-in has ended. Sign in again to set up your workspace.",
            href: "/login?as=employer",
            link: "Sign in",
          });
        }
        setLoaded({ kind: "blocked", message: errorMessage(cause), href: "/", link: "Back to TalentBridge" });
      }
    })();
  }, [initialMode]);

  const problems = {
    mode: mode ? undefined : "Choose how you want to hire.",
    company: company.trim() ? undefined : "Enter your company or business name.",
    name: name.trim() ? undefined : "Enter your name.",
  };
  const shown: Partial<typeof problems> = checked ? problems : {};

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setChecked(true);
    if (Object.values(problems).some(Boolean) || !mode) return;
    setPending(true);
    setError(null);
    try {
      const user = await createWorkspace({ fullName: name, companyName: company, mode, location });
      window.location.replace(homePath(user));
    } catch (cause) {
      setError(errorMessage(cause));
      setPending(false);
    }
  }

  if (loaded.kind === "loading") {
    return (
      <div className="flex justify-center py-6 text-stone" role="status" aria-label="Loading">
        <LoaderCircle className="size-6 animate-spin" />
      </div>
    );
  }
  if (loaded.kind === "blocked") {
    return (
      <div className="flex flex-col gap-4">
        <AuthAlert tone="info">{loaded.message}</AuthAlert>
        <Link href={loaded.href} className={`${authLinkStyles} text-center text-sm`}>
          {loaded.link}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6">
      {error && <AuthAlert>{error}</AuthAlert>}
      <fieldset>
        <legend className="text-base font-semibold text-ink">Which best describes you?</legend>
        <p className="mt-1 text-sm text-stone">How do you want to hire? You can change this later.</p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {MODES.map(({ value, who, title, text, icon: Icon }) => (
            <label
              key={value}
              className={cn(
                "flex cursor-pointer flex-col gap-2 rounded-[14px] border bg-surface-raised p-4 transition-colors has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-brand/55",
                mode === value ? "border-brand-ink bg-brand-soft/60" : "border-border hover:border-border-strong",
              )}
            >
              <input
                type="radio"
                name="mode"
                value={value}
                checked={mode === value}
                onChange={() => setMode(value)}
                className="sr-only"
              />
              <span className="flex items-center gap-2 text-[13px] font-medium text-brand-ink">
                <Icon aria-hidden className="size-4" strokeWidth={1.75} />
                {who}
              </span>
              <span className="text-[15px] font-semibold text-ink">{title}</span>
              <span className="text-[13px] leading-snug text-stone">{text}</span>
            </label>
          ))}
        </div>
        {shown.mode && <p className="mt-2 text-xs text-danger">{shown.mode}</p>}
      </fieldset>
      <Field label="Company or business name" htmlFor="company" error={shown.company}>
        <Input
          id="company"
          autoComplete="organization"
          maxLength={120}
          value={company}
          onChange={(event) => setCompany(event.target.value)}
          aria-invalid={Boolean(shown.company)}
          aria-describedby={shown.company ? fieldErrorId("company") : undefined}
        />
      </Field>
      <Field label="Where is it? (optional)" htmlFor="location">
        <Input
          id="location"
          autoComplete="address-level2"
          maxLength={200}
          placeholder="City, State"
          value={location}
          onChange={(event) => setLocation(event.target.value)}
          aria-describedby="location-hint"
        />
      </Field>
      <p id="location-hint" className="-mt-4 text-xs text-faint">
        New jobs start with this location.
      </p>
      <Field label="Your name" htmlFor="name" error={shown.name}>
        <Input
          id="name"
          autoComplete="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-invalid={Boolean(shown.name)}
          aria-describedby={shown.name ? fieldErrorId("name") : undefined}
        />
      </Field>
      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? "Setting up your workspace…" : "Create workspace"}
      </Button>
    </form>
  );
}
