"use client";

import { useState } from "react";
import { AuthAlert } from "@/components/auth/AuthAlert";
import { Button } from "@/components/ui/Button";
import { loginPath } from "@/lib/auth";
import { createClient } from "@/lib/supabase";

export function SwitchCandidateAccount({ next }: { next: string }) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  async function switchAccount() {
    setPending(true);
    setFailed(false);
    try {
      const { error } = await createClient().auth.signOut({ scope: "local" });
      if (error) throw error;
      window.location.replace(loginPath({ audience: "candidate", next }));
    } catch { setFailed(true); setPending(false); }
  }
  return <div className="mt-5 flex flex-col items-start gap-3">
    {failed && <AuthAlert>We couldn&apos;t sign you out. Please try again.</AuthAlert>}
    <Button size="lg" disabled={pending} onClick={() => void switchAccount()}>{pending ? "Signing out…" : "Sign out and use a candidate account"}</Button>
  </div>;
}
