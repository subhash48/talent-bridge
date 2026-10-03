"use client";

import { useEffect } from "react";

import { SUPABASE_CONFIGURED, createClient } from "@/lib/supabase";

/**
 * Leaves the portal when the session ends without a page load: signing out in another tab, or a
 * refresh token that expired or was revoked. Supabase refreshes access tokens in the background.
 */
export function SessionWatcher() {
  useEffect(() => {
    if (!SUPABASE_CONFIGURED) return;
    const { data } = createClient().auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") window.location.replace("/login");
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return null;
}
