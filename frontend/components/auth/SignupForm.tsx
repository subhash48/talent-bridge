"use client";

import { useState, type FormEvent } from "react";

import { AuthAlert } from "@/components/auth/AuthAlert";
import { Button } from "@/components/ui/Button";
import { Field, fieldErrorId } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { authErrorMessage, landingPath } from "@/lib/auth";
import { SUPABASE_CONFIGURED, createClient } from "@/lib/supabase";
import { ApiError, errorMessage } from "@/services/api";
import { getCurrentUser } from "@/services/me";

const MIN_PASSWORD = 8;

type Form = { fullName: string; email: string; password: string; confirm: string };

/**
 * Public sign-up, for candidates only: there is no role to choose. The API links the account to the
 * candidate's application once they've verified the email they applied with; until then it can see
 * nothing, and nothing here ever creates an application.
 */
export function SignupForm() {
  const [form, setForm] = useState<Form>({ fullName: "", email: "", password: "", confirm: "" });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [showProblems, setShowProblems] = useState(false);

  const problems = {
    fullName: form.fullName.trim() ? undefined : "Enter your full name.",
    password: form.password.length >= MIN_PASSWORD ? undefined : `Use at least ${MIN_PASSWORD} characters.`,
    confirm: form.confirm === form.password ? undefined : "The passwords don't match.",
  };
  const shown: Partial<typeof problems> = showProblems ? problems : {};

  function update(field: keyof Form) {
    return (event: { target: { value: string } }) => setForm((current) => ({ ...current, [field]: event.target.value }));
  }

  async function signUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setShowProblems(true);
    if (Object.values(problems).some(Boolean)) return;
    setPending(true);
    setError(null);
    const supabase = createClient();
    const email = form.email.trim();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password: form.password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirm?next=/`,
        data: { full_name: form.fullName.trim() }, // a display name only; it grants nothing
      },
    });
    if (signUpError) {
      setError(authErrorMessage(signUpError));
      setPending(false);
      return;
    }
    if (!data.session) {
      setSentTo(email); // the usual case: Supabase sends a confirmation email first
      return;
    }
    // Only when the project skips email confirmation, which proves nothing about the address.
    try {
      const user = await getCurrentUser();
      window.location.assign(landingPath(user.role));
    } catch (cause) {
      await supabase.auth.signOut({ scope: "local" });
      setError(cause instanceof ApiError && cause.status === 403 ? cause.message : errorMessage(cause));
      setPending(false);
    }
  }

  if (!SUPABASE_CONFIGURED) return <AuthAlert>Sign-up isn&apos;t available right now.</AuthAlert>;

  if (sentTo) {
    return (
      <AuthAlert tone="success">
        Check your email to verify your account. We sent a link to <strong className="font-medium">{sentTo}</strong>.
        Open it on this device to finish signing up.
      </AuthAlert>
    );
  }

  return (
    <form onSubmit={signUp} className="flex flex-col gap-4">
      {error && <AuthAlert>{error}</AuthAlert>}
      <Field label="Full name" htmlFor="full-name" error={shown.fullName}>
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
      <Field label="Email you applied with" htmlFor="email">
        <Input id="email" type="email" autoComplete="email" required value={form.email} onChange={update("email")} />
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
          aria-describedby={shown.password ? fieldErrorId("password") : undefined}
        />
      </Field>
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
        {pending ? "Creating your account…" : "Create account"}
      </Button>
    </form>
  );
}
