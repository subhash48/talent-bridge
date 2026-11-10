"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import { AuthAlert } from "@/components/auth/AuthAlert";
import { authLinkStyles } from "@/components/auth/AuthCard";
import { AuthDivider, GoogleButton } from "@/components/auth/GoogleButton";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { Button } from "@/components/ui/Button";
import { Field, fieldErrorId } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { authErrorMessage, authRedirectUrl, candidateCompletePath, loginPath, splitFullName } from "@/lib/auth";
import { MIN_PASSWORD, passwordProblem } from "@/lib/password";
import { SUPABASE_CONFIGURED, createClient } from "@/lib/supabase";

type Form = { fullName: string; email: string; password: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * A candidate's own account, before or after applying anywhere: there is no role to choose. Supabase Auth
 * keeps the password and sends the verification email; once the address is verified, /signup/complete makes
 * the candidate account, with any applications already made with that email in it, and opens `next` (a job
 * they were applying for) or the portal. Nothing here ever creates an application.
 */
export function SignupForm({ next }: { next: string | null }) {
  const [form, setForm] = useState<Form>({ fullName: "", email: "", password: "" });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [taken, setTaken] = useState<string | null>(null);
  const [showProblems, setShowProblems] = useState(false);

  const email = form.email.trim();
  const name = splitFullName(form.fullName);
  const problems = {
    fullName: name
      ? undefined
      : form.fullName.trim().split(/\s+/).length < 2
        ? "Enter your full name (first and last)."
        : "Keep your first and last name under 100 characters each.",
    email: EMAIL.test(email) ? undefined : "Enter your email address, like you@example.com.",
    password: passwordProblem(form.password, email) ?? undefined,
  };
  const shown: Partial<typeof problems> = showProblems ? problems : {};
  const complete = candidateCompletePath(next);

  function update(field: keyof Form) {
    return (event: { target: { value: string } }) =>
      setForm((current) => ({ ...current, [field]: event.target.value }));
  }

  async function signUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setShowProblems(true);
    if (Object.values(problems).some(Boolean) || !name) return;
    setPending(true);
    setError(null);
    setTaken(null);
    const { data, error: signUpError } = await createClient().auth.signUp({
      email,
      password: form.password,
      options: {
        emailRedirectTo: authRedirectUrl(complete),
        // A name to show, and which account this sign-in is for. It grants nothing: the API decides.
        data: {
          first_name: name.firstName,
          last_name: name.lastName,
          full_name: `${name.firstName} ${name.lastName}`,
          account_type: "candidate",
        },
      },
    });
    setPending(false);
    if (signUpError) {
      setError(authErrorMessage(signUpError));
      return;
    }
    // Supabase answers an address that already has an account with a user that has no identities, and sends nothing.
    if (data.user && !data.session && data.user.identities?.length === 0) {
      setTaken(email);
      return;
    }
    if (!data.session) {
      setSentTo(email); // the usual case: Supabase sends a verification email first
      return;
    }
    setPending(true);
    window.location.assign(complete); // only when the project skips email verification
  }

  if (!SUPABASE_CONFIGURED) return <AuthAlert>Creating an account isn&apos;t available right now.</AuthAlert>;

  if (sentTo) {
    return (
      <AuthAlert tone="success">
        Check your email to verify your account. We sent a link to <strong className="font-medium">{sentTo}</strong>.
        Open it on this device to finish creating your account.
      </AuthAlert>
    );
  }

  const signInHref = loginPath({ audience: "candidate", next });
  const resetQuery = new URLSearchParams({ as: "candidate", ...(next ? { next } : {}) });

  return (
    <div className="flex flex-col gap-5">
      {error && <AuthAlert>{error}</AuthAlert>}
      {taken && (
        <AuthAlert tone="info">
          An account with this email already exists.{" "}
          <Link href={signInHref} className="font-medium underline underline-offset-4">
            Sign in instead
          </Link>
          , or{" "}
          <Link href={`/forgot-password?${resetQuery}`} className="font-medium underline underline-offset-4">
            reset your password
          </Link>
          .
        </AuthAlert>
      )}

      <GoogleButton audience="candidate" intent="signup" next={next} disabled={pending} />
      <AuthDivider>or sign up with email</AuthDivider>

      <form onSubmit={signUp} noValidate className="flex flex-col gap-4">
        <Field label="Full name" htmlFor="full-name" error={shown.fullName}>
          <Input
            id="full-name"
            autoComplete="name"
            required
            maxLength={201}
            autoFocus
            value={form.fullName}
            onChange={update("fullName")}
            aria-invalid={Boolean(shown.fullName)}
            aria-describedby={shown.fullName ? fieldErrorId("full-name") : undefined}
          />
        </Field>
        <Field label="Email address" htmlFor="email" error={shown.email}>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            required
            value={form.email}
            onChange={update("email")}
            aria-invalid={Boolean(shown.email)}
            aria-describedby={shown.email ? fieldErrorId("email") : "email-hint"}
          />
        </Field>
        {!shown.email && (
          <p id="email-hint" className="-mt-2.5 text-xs text-stone">
            Applied before? Use the same email and your applications will be in your account.
          </p>
        )}
        <Field label="Create password" htmlFor="password" error={shown.password}>
          <PasswordInput
            id="password"
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
          <p id="password-rules" className="-mt-2.5 text-xs text-stone">
            At least {MIN_PASSWORD} characters, with letters and a number.
          </p>
        )}
        <Button type="submit" size="lg" disabled={pending} className="mt-1 w-full">
          {pending ? "Creating your account…" : "Create account"}
        </Button>
        <p className="text-center text-xs leading-relaxed text-stone">
          By creating an account, you agree to Hirvello&apos;s{" "}
          <Link href="/terms" className={authLinkStyles}>
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className={authLinkStyles}>
            Privacy Policy
          </Link>
          .
        </p>
      </form>
    </div>
  );
}
