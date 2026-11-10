"use client";

import { useCallback, useState } from "react";

import { loginPath, type Audience } from "@/lib/auth";
import { SUPABASE_CONFIGURED, createClient } from "@/lib/supabase";

// Set while this tab is signing out on purpose, so SessionWatcher leaves the page to the sign-out's own redirect
// rather than sending it to plain /login first.
let signingOutHere = false;

/** True while this tab is signing out through useSignOut. */
export function isSigningOut(): boolean {
  return signingOutHere;
}

/**
 * Ends this browser's session (other devices stay signed in), then loads the sign-in page for the person's kind of
 * account afresh, saying they've signed out, so nothing the portal had in memory survives.
 */
export function useSignOut(audience: Audience) {
  const [signingOut, setSigningOut] = useState(false);

  const signOut = useCallback(async () => {
    setSigningOut(true);
    signingOutHere = true;
    try {
      if (SUPABASE_CONFIGURED) await createClient().auth.signOut({ scope: "local" });
    } finally {
      window.location.replace(loginPath({ audience, reason: "signed_out" }));
    }
  }, [audience]);

  return { signOut, signingOut };
}
