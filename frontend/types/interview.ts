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

