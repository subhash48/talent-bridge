"use client";

import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import { AuthAlert } from "@/components/auth/AuthAlert";
import { authLinkStyles } from "@/components/auth/AuthCard";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { createClient } from "@/lib/supabase";
import { ApiError, errorMessage } from "@/services/api";
import { createCandidateAccount } from "@/services/accounts";

type State =
  | { kind: "working" }
  | { kind: "names"; first: string; last: string }
  | { kind: "signed_out" }
  | { kind: "problem"; message: string; code: string };

/**
 * Where the candidate's verification email lands, signed in. Makes their candidate account (any applications
 * already made with this email are in it) and opens the portal. The names are the ones given at sign-up; if
 * they're missing (an older link), they're asked for here.
 */
export function CompleteCandidateSignup() {
  const [state, setState] = useState<State>({ kind: "working" });
  const started = useRef(false);

  const finish = useCallback(async (firstName: string, lastName: string) => {
    setState({ kind: "working" });
    try {
      await createCandidateAccount({ firstName, lastName });
      window.location.replace("/candidate");
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) return setState({ kind: "signed_out" });
      const code = cause instanceof ApiError ? cause.code : "error";
      setState({ kind: "problem", message: errorMessage(cause), code });
    }
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      const { data } = await createClient().auth.getUser();
      if (!data.user) return setState({ kind: "signed_out" });
      const meta = data.user.user_metadata ?? {};
      const first = typeof meta.first_name === "string" ? meta.first_name.trim() : "";
      const last = typeof meta.last_name === "string" ? meta.last_name.trim() : "";
      if (first && last) await finish(first, last);
      else setState({ kind: "names", first, last });
    })();
  }, [finish]);

  if (state.kind === "working") {
    return (
      <div className="flex justify-center py-2 text-stone" role="status" aria-label="Setting up your account">
        <LoaderCircle className="size-6 animate-spin" />
      </div>
    );
  }
  if (state.kind === "signed_out") {
    return (
      <div className="flex flex-col gap-4">
        <AuthAlert tone="info">This link has expired or was already used. Sign in to continue.</AuthAlert>
        <Link href="/login?as=candidate" className={`${authLinkStyles} text-center text-sm`}>
          Sign in
        </Link>
      </div>
    );
  }
  if (state.kind === "problem") {
    return (
      <div className="flex flex-col gap-4">
        <AuthAlert>{state.message}</AuthAlert>
        {state.code === "staff_email" ? (
          <Link href="/login?as=employer" className={`${authLinkStyles} text-center text-sm`}>
            Sign in to your employer account
          </Link>
        ) : (
          <Link href="/login?as=candidate" className={`${authLinkStyles} text-center text-sm`}>
            Back to sign in
          </Link>
        )}
      </div>
    );
  }
  return <Names initial={state} onDone={finish} />;
}

type NamesProps = { initial: { first: string; last: string }; onDone: (first: string, last: string) => void };

function Names({ initial, onDone }: NamesProps) {
  const [first, setFirst] = useState(initial.first);
  const [last, setLast] = useState(initial.last);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (first.trim() && last.trim()) onDone(first.trim(), last.trim());
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="First name" htmlFor="first-name">
          <Input
            id="first-name"
            autoComplete="given-name"
            required
            autoFocus
            value={first}
            onChange={(e) => setFirst(e.target.value)}
          />
        </Field>
        <Field label="Last name" htmlFor="last-name">
          <Input
            id="last-name"
            autoComplete="family-name"
            required
            value={last}
            onChange={(e) => setLast(e.target.value)}
          />
        </Field>
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={!first.trim() || !last.trim()}>
        Open my portal
      </Button>
    </form>
  );
}
