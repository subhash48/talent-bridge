import type { Session } from "@supabase/supabase-js";

export type AuthState = {
  session: Session | null;
  token: string | null;
  loading: boolean;
};

export function useAuth(): AuthState {
  // TODO: read the Supabase session and subscribe to auth changes (ARCHITECTURE.md 10.1).
  return { session: null, token: null, loading: false };
}
