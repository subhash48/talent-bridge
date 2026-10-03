"use client";

import { useState, type FormEvent } from "react";

import { AuthAlert } from "@/components/auth/AuthAlert";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { authErrorMessage } from "@/lib/auth";
import { SUPABASE_CONFIGURED, createClient } from "@/lib/supabase";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function sendLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const address = email.trim();
    const { error: resetError } = await createClient().auth.resetPasswordForEmail(address, {
      redirectTo: `${window.location.origin}/auth/confirm?next=/reset-password`,
    });
    setPending(false);
    if (resetError) setError(authErrorMessage(resetError));
    else setSentTo(address);
  }

  if (!SUPABASE_CONFIGURED) return <AuthAlert>Password reset isn&apos;t available right now.</AuthAlert>;

  if (sentTo) {
    // The same answer whether or not the address has an account.
    return (
      <AuthAlert tone="success">
        If <strong className="font-medium">{sentTo}</strong> has an account, we&apos;ve sent it a link to reset the
        password. Open it on this device.
      </AuthAlert>
    );
  }

  return (
    <form onSubmit={sendLink} className="flex flex-col gap-4">
      {error && <AuthAlert>{error}</AuthAlert>}
      <Field label="Email" htmlFor="email">
        <Input
          id="email"
          type="email"
          autoComplete="email"
          required
          autoFocus
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </Field>
      <Button type="submit" size="lg" disabled={pending} className="mt-1 w-full">
        {pending ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}
