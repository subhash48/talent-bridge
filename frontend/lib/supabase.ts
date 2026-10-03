import { createBrowserClient } from "@supabase/ssr";

// Public values only: the project URL and its publishable key are safe in the browser. Secret and
// service role keys never belong in NEXT_PUBLIC_ variables.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
export const SUPABASE_CONFIGURED = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);

// Browser client for signing in and the session only; all data goes through the API (ARCHITECTURE.md 2).
// The session lives in cookies, so server rendering and proxy.ts see it too. One instance per tab.
export function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
}
