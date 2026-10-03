export type ChangeTopic = "activity" | "insight" | "interview" | "message" | "stage";

export type ChangePing = {
  application_id: string | null;
  topics: ChangeTopic[];
};

// Realtime carries pings, not payloads: callers refetch through the API (ARCHITECTURE.md 5.6).
export function useRealtime(onPing: (ping: ChangePing) => void): void {
  // TODO: subscribe to change_feed INSERTs via Supabase Realtime and call onPing; RLS filters rows.
}
