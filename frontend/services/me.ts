import { USE_MOCK_API, apiFetch } from "@/services/api";
import { mockApi } from "@/services/mock/api";
import type { ApiUser } from "@/types/api";
import type { CurrentUser } from "@/types/workspace";

const TITLES: Record<ApiUser["role"], string> = { recruiter: "Recruiter", admin: "Admin", candidate: "Candidate" };

// GET /me: the configured demo recruiter until Supabase Auth is added.
export async function getCurrentUser(token?: string): Promise<CurrentUser> {
  if (USE_MOCK_API) return mockApi.getCurrentUser();
  const user = await apiFetch<ApiUser>("/me", { token });
  return { id: user.id, name: user.full_name, title: TITLES[user.role], email: user.email, organization: user.organization };
}
