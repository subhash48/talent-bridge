"use client";

import { useCallback, useState } from "react";

import { SUPABASE_CONFIGURED, createClient } from "@/lib/supabase";

/**
 * Ends this browser's session (other devices stay signed in), then loads /login afresh so nothing
 * the portal had in memory survives.
 */
export function useSignOut() {
  const [signingOut, setSigningOut] = useState(false);

  const signOut = useCallback(async () => {
    setSigningOut(true);
    if (SUPABASE_CONFIGURED) await createClient().auth.signOut({ scope: "local" });
    window.location.replace("/login");
  }, []);

  return { signOut, signingOut };
}
