"use client";

import { useEffect } from "react";

import { isSigningOut } from "@/hooks/useSignOut";
import { SUPABASE_CONFIGURED, createClient } from "@/lib/supabase";

/**
 * Keeps an open portal in step with the session, which every tab shares through its cookies. Leaves
 * for /login when the session ends without a page load (signed out in another tab, or a refresh
 * token that expired or was revoked), and goes home when another tab signs in as someone else, so
 * this tab never keeps polling the API as a person it wasn't rendered for. Home routes by the role
 * on record. Supabase refreshes access tokens in the background. A sign-out from this tab's menu (useSignOut)
 * chooses its own page, so it's left alone.
 */
export function SessionWatcher() {
  useEffect(() => {
    if (!SUPABASE_CONFIGURED) return;
    let renderedFor: string | undefined;
    const { data } = createClient().auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        // Signing out from this tab's own menu goes to its own sign-in page; only an outside sign-out leaves here.
        if (!isSigningOut()) window.location.replace("/login");
        return;
      }
      const userId = session?.user.id;
      if (event === "INITIAL_SESSION") renderedFor = userId;
      else if (renderedFor && userId && userId !== renderedFor) window.location.replace("/");
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return null;
}
