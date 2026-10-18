import { firstName, formatDayLabel, formatDuration, formatTime } from "@/lib/format";
import type { MessageDraft } from "@/services/ai";

import { mockApi } from "./api";
import { mockDelay } from "./db";

// A template follow-up built from the same data the recruiter sees, standing in for POST /ai/draft-message.

export async function mockDraftMessage(candidateId: string, signal?: AbortSignal): Promise<MessageDraft> {
  const candidate = await mockApi.getCandidate(candidateId);
  if (!candidate) throw new Error("I couldn't find that candidate. They may have been archived.");

  const [detail, user] = await Promise.all([mockApi.getCandidateDetail(candidateId), mockApi.getCurrentUser()]);
  await mockDelay(350, signal);

  const now = Date.now();
  const upcoming = detail.interviews.find((interview) => new Date(interview.scheduledAt).getTime() > now);
  const pastInterview = detail.interviews.find((interview) => interview.status === "completed");
  const focus = people(candidate.skills.slice(0, 2).map((skill) => skill.toLowerCase()));
  let subject: string;
  let body: string;

  switch (candidate.stage) {
    case "sourced":
      subject = `${candidate.role} at Encord`;
      body = `I came across your work in ${focus} and thought you'd be a great fit for our ${candidate.role} role. We're building the data layer for physical AI, and the team is growing.\n\nWould you be open to a 20-minute chat this week?`;
      break;
    case "screening":
      subject = `Next steps for your ${candidate.role} application`;
      body = candidate.followUp
        ? "Just checking in on the assessment I sent over. No pressure at all; if you need more time, let me know and we can adjust the deadline."
        : "Thanks for your time so far. The team is reviewing your application, and I'll be in touch about next steps in the next few days.\n\nIn the meantime, let me know if you have any questions about the role or the team.";
      break;
    case "interview":
      if (upcoming) {
        const format = upcoming.format === "onsite" ? "at our London office" : upcoming.format === "phone" ? "by phone" : "over video";
        subject = `Your ${upcoming.title.toLowerCase()} ${dayPhrase(upcoming.scheduledAt)}`;
        body = `Looking forward to your ${upcoming.title.toLowerCase()} ${dayPhrase(upcoming.scheduledAt)} with ${people(upcoming.interviewers)}.\n\nTo help you prepare: the session is ${formatDuration(upcoming.durationMinutes)} (${format}), and the conversation will focus on ${focus}. Your prep materials are in the candidate portal.\n\nIf anything comes up, just reply here.`;
      } else {
        subject = "An update on your interview";
        body = `Thanks again for your time in the ${pastInterview?.title.toLowerCase() ?? "interview"}. The team is finishing their feedback, and I'll come back to you with next steps shortly.`;
      }
      break;
    case "offer":
      subject = "Checking in on your offer";
      body = "I wanted to check in on the offer and see if you have any questions. I'm happy to set up a call with the hiring team to go through equity, benefits or anything else.";
      break;
    case "hired":
      subject = "Welcome to Encord!";
      body = "We're so excited to have you joining the team. You'll receive your onboarding pack shortly, with everything you need for your first week.\n\nLet me know if there's anything I can help with before you start.";
      break;
  }

  return { subject, body: `Hi ${firstName(candidate.name)},\n\n${body}\n\nBest,\n${firstName(user.name)}` };
}

function dayPhrase(iso: string): string {
  const label = formatDayLabel(iso);
  const day = label === "Today" || label === "Tomorrow" ? label.toLowerCase() : `on ${label}`;
  return `${day} at ${formatTime(iso)}`;
}

function people(names: string[]): string {
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : (names[0] ?? "the team");
}
