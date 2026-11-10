"use client";

import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import { AuthAlert } from "@/components/auth/AuthAlert";
import { authLinkStyles } from "@/components/auth/AuthCard";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { landingPath, loginPath, splitFullName } from "@/lib/auth";
import { createClient } from "@/lib/supabase";
import { ApiError, errorMessage } from "@/services/api";
import { createCandidateAccount } from "@/services/accounts";

type State =
  | { kind: "working" }
  | { kind: "names"; first: string; last: string }
  | { kind: "signed_out" }
  | { kind: "problem"; message: string; code: string };

/**
 * Where the candidate's verification email lands, signed in, and where a first Google sign-in comes to. Makes their
 * candidate account (any applications already made with this email are in it) and opens `next` when it's somewhere
 * a candidate may go (a job they were applying for, a portal page), else the portal. The names are the ones given
 * at sign-up, or Google's full name split in two; if neither gives both (an older link, a one-word name), they're
 * asked for here.
 */
export function CompleteCandidateSignup({ next }: { next: string | null }) {
  const [state, setState] = useState<State>({ kind: "working" });
  const started = useRef(false);

  const finish = useCallback(
    async (firstName: string, lastName: string) => {
      setState({ kind: "working" });
      try {
        await createCandidateAccount({ firstName, lastName });
        window.location.replace(landingPath("candidate", next));
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 401) return setState({ kind: "signed_out" });
        const code = cause instanceof ApiError ? cause.code : "error";
        setState({ kind: "problem", message: errorMessage(cause), code });
      }
    },
    [next],
  );

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      const { data } = await createClient().auth.getUser();
      if (!data.user) return setState({ kind: "signed_out" });
      const meta = data.user.user_metadata ?? {};
      const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
      // Google gives one full name (full_name, or name); sign-up here gives first and last.
      const google = splitFullName(text(meta.full_name) || text(meta.name));
      const first = text(meta.first_name) || google?.firstName || "";
      const last = text(meta.last_name) || google?.lastName || "";
      // Names saved at sign-up longer than an account takes (100) are asked again, never sent to fail forever.
      if (first && last && first.length <= 100 && last.length <= 100) await finish(first, last);
      else {
        const said = first || text(meta.full_name) || text(meta.name);
        setState({ kind: "names", first: said.slice(0, 100), last: last.slice(0, 100) });
      }
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
        <Link href={loginPath({ audience: "candidate", next })} className={`${authLinkStyles} text-center text-sm`}>
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
          <Link href={loginPath({ audience: "candidate", next })} className={`${authLinkStyles} text-center text-sm`}>
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
            maxLength={100}
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
            maxLength={100}
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
