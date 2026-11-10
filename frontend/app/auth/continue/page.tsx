import type { Metadata } from "next";

import { AuthContinue, type ContinueParams } from "@/components/auth/AuthContinue";
import { localPath } from "@/lib/auth";

export const metadata: Metadata = { title: "Signing you in" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const one = (value: string | string[] | undefined) => (typeof value === "string" ? value : null);

// Where /auth/confirm sends a Google sign-in (and the emailed links that finish the same way) once the session
// cookie is set. Only known values are read from the address; the rest happens in the browser, which asks the
// API what the account is.
export default async function AuthContinuePage({ searchParams }: Props) {
  const params = await searchParams;
  const as = one(params.as);
  const mode = one(params.mode);
  const error = one(params.error);
  const continueParams: ContinueParams = {
    audience: as === "candidate" || as === "employer" ? as : null,
    intent: one(params.intent) === "signup" ? "signup" : "signin",
    mode: mode === "full" || mode === "simple" ? mode : null,
    next: localPath(one(params.next)),
    error: error === "cancelled" || error === "failed" ? error : error ? "failed" : null,
    via: one(params.via) === "email" ? "email" : null,
  };
  return <AuthContinue {...continueParams} />;
}
