import { useAuth } from "@/hooks/useAuth";
import type { Role } from "@/types/candidate";

// Role lives in app_metadata, which only the server can write (ARCHITECTURE.md 10.1).
export function useRole(): Role | null {
  const { session } = useAuth();
  const role = session?.user.app_metadata?.role;
  return role === "recruiter" || role === "candidate" || role === "admin" ? role : null;
}
