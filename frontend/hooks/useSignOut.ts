"use client";

import { useCallback, useState } from "react";

import { engagement } from "@/lib/engagement";
import { SUPABASE_CONFIGURED, createClient } from "@/lib/supabase";

/**
 * Ends this browser's session (other devices stay signed in), then loads /login afresh so nothing
 * the portal had in memory survives.
 */
export function useSignOut() {
  const [signingOut, setSigningOut] = useState(false);

  const signOut = useCallback(async () => {
    setSigningOut(true);
    engagement.stop(); // ends the portal visit while the session can still report it
    if (SUPABASE_CONFIGURED) await createClient().auth.signOut({ scope: "local" });
    window.location.replace("/login");
  }, []);

  return { signOut, signingOut };
}
