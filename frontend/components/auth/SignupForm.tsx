"use client";

import { useState, type FormEvent } from "react";

import { AuthAlert } from "@/components/auth/AuthAlert";
import { Button } from "@/components/ui/Button";
import { Field, fieldErrorId } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { authErrorMessage } from "@/lib/auth";
import { MIN_PASSWORD, passwordProblem } from "@/lib/password";
import { SUPABASE_CONFIGURED, createClient } from "@/lib/supabase";

type Form = { firstName: string; lastName: string; email: string; password: string; confirm: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Where the verification email's link lands: it finishes the candidate account, then opens the portal. */
export const CANDIDATE_COMPLETE = "/signup/complete";

/**
 * A candidate's own account, before or after applying anywhere: there is no role to choose. Supabase Auth
 * keeps the password and sends the verification email; once the address is verified, /signup/complete makes
 * the candidate account, with any applications already made with that email in it. Nothing here ever
 * creates an application.
 */
export function SignupForm() {
  const [form, setForm] = useState<Form>({ firstName: "", lastName: "", email: "", password: "", confirm: "" });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [showProblems, setShowProblems] = useState(false);

  const email = form.email.trim();
  const problems = {
    firstName: form.firstName.trim() ? undefined : "Enter your first name.",
    lastName: form.lastName.trim() ? undefined : "Enter your last name.",
    email: EMAIL.test(email) ? undefined : "Enter your email address, like you@example.com.",
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
    const firstName = form.firstName.trim();
    const lastName = form.lastName.trim();
    const { data, error: signUpError } = await createClient().auth.signUp({
      email,
      password: form.password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent(CANDIDATE_COMPLETE)}`,
        // A name to show, and which account this sign-in is for. It grants nothing: the API decides.
        data: {
          first_name: firstName,
          last_name: lastName,
          full_name: `${firstName} ${lastName}`,
          account_type: "candidate",
        },
      },
    });
    if (signUpError) {
      setError(authErrorMessage(signUpError));
      setPending(false);
      return;
    }
    if (!data.session) {
      setSentTo(email); // the usual case: Supabase sends a verification email first
      return;
    }
    window.location.assign(CANDIDATE_COMPLETE); // only when the project skips email verification
  }

  if (!SUPABASE_CONFIGURED) return <AuthAlert>Sign-up isn&apos;t available right now.</AuthAlert>;

  if (sentTo) {
    return (
      <AuthAlert tone="success">
        Check your email to verify your account. We sent a link to <strong className="font-medium">{sentTo}</strong>.
        Open it on this device to finish creating your account.
      </AuthAlert>
    );
  }

  return (
    <form onSubmit={signUp} noValidate className="flex flex-col gap-4">
      {error && <AuthAlert>{error}</AuthAlert>}
      <div className="grid grid-cols-2 gap-3">
        <Field label="First name" htmlFor="first-name" error={shown.firstName}>
          <Input
            id="first-name"
            autoComplete="given-name"
            required
            autoFocus
            value={form.firstName}
            onChange={update("firstName")}
            aria-invalid={Boolean(shown.firstName)}
            aria-describedby={shown.firstName ? fieldErrorId("first-name") : undefined}
          />
        </Field>
        <Field label="Last name" htmlFor="last-name" error={shown.lastName}>
          <Input
            id="last-name"
            autoComplete="family-name"
            required
            value={form.lastName}
            onChange={update("lastName")}
            aria-invalid={Boolean(shown.lastName)}
            aria-describedby={shown.lastName ? fieldErrorId("last-name") : undefined}
          />
        </Field>
      </div>
      <Field label="Email" htmlFor="email" error={shown.email}>
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
      <p className="text-xs leading-relaxed text-stone">
        Applied before? Use the email you applied with, and your applications will be in your account.
      </p>
      <Button type="submit" size="lg" disabled={pending} className="mt-1 w-full">
        {pending ? "Creating your account…" : "Create account"}
      </Button>
    </form>
  );
}
