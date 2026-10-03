import type { Role } from "@/types/candidate";

export type { Role };

export function roleHomePath(role: Role): string {
  return role === "candidate" ? "/candidate" : "/recruiter";
}
