import type { JourneyStep } from "@/types/application";
import type { PortalInterview } from "@/types/interview";

// Mirrors backend/app/schemas/candidate.py.
export type Role = "recruiter" | "candidate" | "admin";

export type Candidate = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  location: string | null;
  pronouns: string | null;
  avatar_url: string | null;
  headline: string | null;
  created_at: string;
};

// GET /v1/portal/home (ARCHITECTURE.md 8.5).
export type PortalHome = {
  greeting: { name: string };
  application: {
    id: string;
    job_title: string;
    team: string | null;
    company: string;
    journey: JourneyStep[];
    next_steps: string | null;
  } | null;
  upcoming_interview: PortalInterview | null;
  recruiter: { name: string; title: string | null; avatar_url: string | null } | null;
};
