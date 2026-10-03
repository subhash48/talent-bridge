// Mirrors backend/app/schemas/interview.py.
export type InterviewStatus =
  | "scheduled"
  | "confirmed"
  | "reschedule_requested"
  | "completed"
  | "canceled"
  | "no_show";

export type Interview = {
  id: string;
  application_id: string;
  title: string;
  interview_type: string;
  scheduled_at: string;
  duration_minutes: number;
  meeting_url: string | null;
  status: InterviewStatus;
  confirmed_at: string | null;
};

// Public fields only, for the candidate's own interviews (ARCHITECTURE.md 6.3).
export type Interviewer = {
  name: string;
  title: string | null;
  bio: string | null;
  avatar_url: string | null;
};

export type PortalInterview = {
  id: string;
  title: string;
  starts_at: string;
  duration_minutes: number;
  meeting_url: string | null;
  status: InterviewStatus;
  interviewers: Interviewer[];
};

export type PrepResource = {
  id: string;
  title: string;
  viewed: boolean;
};
