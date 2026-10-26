"use client";

import { useState, type FormEvent } from "react";

import { AuthAlert } from "@/components/auth/AuthAlert";
import { Button } from "@/components/ui/Button";
import { Field, fieldErrorId } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { authErrorMessage } from "@/lib/auth";
import { MIN_PASSWORD, passwordProblem } from "@/lib/password";
import { createClient } from "@/lib/supabase";

/** Sets a password for the session a reset or invitation link started, then opens the user's
 * workspace (or redirectTo). The password is chosen here by its owner and goes only to Supabase Auth.
 * email: the account's, so the password can't be made from it. */
export function ResetPasswordForm({
  submitLabel = "Set new password",
  redirectTo = "/",
  email = "",
  passwordLabel = "New password",
}: {
  submitLabel?: string;
  redirectTo?: string;
  email?: string;
  passwordLabel?: string;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showProblems, setShowProblems] = useState(false);

  const problems = {
    password: passwordProblem(password, email) ?? undefined,
    confirm: confirm === password ? undefined : "The passwords don't match.",
  };
  const shown: Partial<typeof problems> = showProblems ? problems : {};

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setShowProblems(true);
    if (problems.password || problems.confirm) return;
    setPending(true);
    setError(null);
    const { error: updateError } = await createClient().auth.updateUser({ password });
    if (updateError) {
      setError(authErrorMessage(updateError));
      setPending(false);
      return;
    }
    window.location.replace(redirectTo); // "/" opens their workspace, by the role the API has on record
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      {error && <AuthAlert>{error}</AuthAlert>}
      <Field label={passwordLabel} htmlFor="password" error={shown.password}>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          required
          autoFocus
          minLength={MIN_PASSWORD}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-invalid={Boolean(shown.password)}
          aria-describedby={shown.password ? fieldErrorId("password") : undefined}
        />
      </Field>
      <Field label={`Confirm ${passwordLabel.toLowerCase()}`} htmlFor="confirm-password" error={shown.confirm}>
        <Input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          aria-invalid={Boolean(shown.confirm)}
          aria-describedby={shown.confirm ? fieldErrorId("confirm-password") : undefined}
        />
      </Field>
      <Button type="submit" size="lg" disabled={pending} className="mt-1 w-full">
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
