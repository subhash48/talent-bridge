import { USE_MOCK_API, apiFetch } from "@/services/api";
import { mockApi } from "@/services/mock/api";
import type { ApiUser } from "@/types/api";
import type { CurrentUser } from "@/types/workspace";

const TITLES: Record<ApiUser["role"], string> = { recruiter: "Recruiter", admin: "Admin", candidate: "Candidate" };

// GET /me: whoever the access token belongs to, with the role the API has on record for them.
export async function getCurrentUser(): Promise<CurrentUser> {
  if (USE_MOCK_API) return mockApi.getCurrentUser();
  const user = await apiFetch<ApiUser>("/me");
  return {
    id: user.id,
    name: user.full_name,
    title: TITLES[user.role],
    email: user.email,
    organization: user.organization,
    role: user.role,
    candidateId: user.candidate_id,
  };
}
