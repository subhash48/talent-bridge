import { USE_MOCK_API, apiFetch } from "@/services/api";
import { mockApi } from "@/services/mock/api";
import type { ApiInterview, ApiInterviewListItem } from "@/types/api";
import type { InterviewStatus } from "@/types/interview";
import type { CandidateRef, NewInterviewInput, ScheduledInterview } from "@/types/workspace";

// Interviews: the recruiter's schedule, and scheduling for one application.

export async function getInterviews(token?: string): Promise<ScheduledInterview[]> {
  if (USE_MOCK_API) return mockApi.getInterviews();
  const interviews = await apiFetch<ApiInterviewListItem[]>("/interviews", { token });
  return interviews.map((interview) =>
    fromInterview(interview, {
      id: interview.candidate.application_id,
      name: interview.candidate.full_name,
      role: interview.candidate.job_title,
      avatarUrl: interview.candidate.avatar_url ?? undefined,
    }),
  );
}

/** POST /applications/{id}/interviews. The server also records it in the candidate's activity. */
export async function scheduleInterview(candidate: CandidateRef, input: NewInterviewInput, token?: string): Promise<ScheduledInterview> {
  if (USE_MOCK_API) return mockApi.scheduleInterview(candidate, input);
  const interview = await apiFetch<ApiInterview>(`/applications/${candidate.id}/interviews`, {
    token,
    method: "POST",
    body: JSON.stringify({
      title: input.title,
      interview_type: input.format,
      scheduled_at: input.scheduledAt,
      duration_minutes: input.durationMinutes,
      interviewers: input.interviewers,
      meeting_url: input.meetingUrl || null,
    }),
  });
  return fromInterview(interview, candidate);
}

/**
 * The API stores scheduled, completed or cancelled, plus when the candidate confirmed. A scheduled
 * interview with a confirmation shows as confirmed, and a completed one without notes is still
 * waiting on feedback.
 */
export function fromInterview(interview: ApiInterview, candidate: CandidateRef): ScheduledInterview {
  return {
    id: interview.id,
    candidate,
    title: interview.title,
    scheduledAt: interview.scheduled_at,
    durationMinutes: interview.duration_minutes,
    format: interview.interview_type,
    interviewers: interview.interviewers,
    status: statusOf(interview),
    feedback: interview.status === "completed" ? (interview.notes ? "submitted" : "pending") : undefined,
  };
}

function statusOf(interview: ApiInterview): InterviewStatus {
  if (interview.status === "cancelled") return "canceled";
  if (interview.status === "scheduled" && interview.confirmed_at) return "confirmed";
  return interview.status;
}
