import { USE_MOCK_API, apiFetch } from "@/services/api";
import { mockApi } from "@/services/mock/api";
import type { CurrentUser } from "@/types/workspace";

// GET /v1/me (ARCHITECTURE.md 8.4).
export function getCurrentUser(token?: string): Promise<CurrentUser> {
  if (USE_MOCK_API) return mockApi.getCurrentUser();
  return apiFetch<CurrentUser>("/v1/me", { token });
}
