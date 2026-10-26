"use client";

import { useState, type FormEvent } from "react";

import { AuthAlert } from "@/components/auth/AuthAlert";
import { Button } from "@/components/ui/Button";
import { Field, fieldErrorId } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { authErrorMessage } from "@/lib/auth";
import { MIN_PASSWORD, passwordProblem } from "@/lib/password";
import { SUPABASE_CONFIGURED, createClient } from "@/lib/supabase";
import type { WorkspaceMode } from "@/types/workspace";

type Form = { fullName: string; email: string; password: string; confirm: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function onboardingPath(mode: WorkspaceMode | null): string {
  return mode ? `/onboarding/workspace?mode=${mode}` : "/onboarding/workspace";
}

/**
 * An employer's own sign-in, for setting up their company's workspace. Supabase Auth keeps the password and
 * sends the verification email; its link opens the workspace set-up, where they say how they hire. Nothing
 * exists in TalentBridge until then, and the email must be verified first.
 */
export function EmployerSignupForm({ mode }: { mode: WorkspaceMode | null }) {
  const [form, setForm] = useState<Form>({ fullName: "", email: "", password: "", confirm: "" });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [showProblems, setShowProblems] = useState(false);

  const email = form.email.trim();
  const problems = {
    fullName: form.fullName.trim() ? undefined : "Enter your name.",
    email: EMAIL.test(email) ? undefined : "Enter your work email address.",
    password: passwordProblem(form.password, email) ?? undefined,
    confirm: form.confirm === form.password ? undefined : "The passwords don't match.",
  };
  const shown: Partial<typeof problems> = showProblems ? problems : {};

  function update(field: keyof Form) {
    return (event: { target: { value: string } }) =>
      setForm((current) => ({ ...current, [field]: event.target.value }));
  }

  async function signUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setShowProblems(true);
    if (Object.values(problems).some(Boolean)) return;
    setPending(true);
    setError(null);
    const next = onboardingPath(mode);
    const { data, error: signUpError } = await createClient().auth.signUp({
      email,
      password: form.password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent(next)}`,
        // Shown back on the set-up page; it grants nothing. The API makes the workspace once it's asked to.
        data: { full_name: form.fullName.trim(), account_type: "employer", hire_mode: mode },
      },
    });
    if (signUpError) {
      setError(authErrorMessage(signUpError));
      setPending(false);
      return;
    }
    if (!data.session) {
      setSentTo(email);
      return;
    }
    window.location.assign(next);
  }

  if (!SUPABASE_CONFIGURED) return <AuthAlert>Sign-up isn&apos;t available right now.</AuthAlert>;

  if (sentTo) {
    return (
      <AuthAlert tone="success">
        Check your email to verify it. We sent a link to <strong className="font-medium">{sentTo}</strong>. Open it on
        this device to set up your workspace.
      </AuthAlert>
    );
  }

  return (
    <form onSubmit={signUp} noValidate className="flex flex-col gap-4">
      {error && <AuthAlert>{error}</AuthAlert>}
      <Field label="Your name" htmlFor="full-name" error={shown.fullName}>
        <Input
          id="full-name"
          autoComplete="name"
          required
          autoFocus
          value={form.fullName}
          onChange={update("fullName")}
          aria-invalid={Boolean(shown.fullName)}
          aria-describedby={shown.fullName ? fieldErrorId("full-name") : undefined}
        />
      </Field>
      <Field label="Work email" htmlFor="email" error={shown.email}>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={form.email}
          onChange={update("email")}
          aria-invalid={Boolean(shown.email)}
          aria-describedby={shown.email ? fieldErrorId("email") : undefined}
        />
      </Field>
      <Field label="Password" htmlFor="password" error={shown.password}>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD}
          value={form.password}
          onChange={update("password")}
          aria-invalid={Boolean(shown.password)}
          aria-describedby={shown.password ? fieldErrorId("password") : "password-rules"}
        />
      </Field>
      {!shown.password && (
        <p id="password-rules" className="-mt-2 text-xs text-faint">
          At least {MIN_PASSWORD} characters, with letters and a number.
        </p>
      )}
      <Field label="Confirm password" htmlFor="confirm-password" error={shown.confirm}>
        <Input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          required
          value={form.confirm}
          onChange={update("confirm")}
          aria-invalid={Boolean(shown.confirm)}
          aria-describedby={shown.confirm ? fieldErrorId("confirm-password") : undefined}
        />
      </Field>
      <Button type="submit" size="lg" disabled={pending} className="mt-1 w-full">
        {pending ? "Creating your sign-in…" : "Continue"}
      </Button>
    </form>
  );
}
