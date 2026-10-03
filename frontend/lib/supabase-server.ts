import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { SUPABASE_CONFIGURED, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/supabase";
import { setServerTokenSource } from "@/services/api";

/** Supabase for Server Components and Route Handlers, reading the session from this request's cookies. */
export async function createServerSupabase() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components can't set cookies. proxy.ts has already refreshed the session.
        }
      },
    },
  });
}

/** This request's Supabase access token, or null when nobody is signed in. Never trusted here: the API verifies it. */
export async function getServerAccessToken(): Promise<string | null> {
  if (!SUPABASE_CONFIGURED) return null;
  const { data } = await (await createServerSupabase()).auth.getSession();
  return data.session?.access_token ?? null;
}

// API calls made while rendering on the server send the token from the request's cookies.
setServerTokenSource(getServerAccessToken);
