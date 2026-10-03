import { createBrowserClient } from "@supabase/ssr";

// Browser client for auth sessions and Realtime only; all data goes through the API (ARCHITECTURE.md 2).
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
