import { firstName, formatDayLabel, formatDuration, formatRelativeTime, formatSchedule, formatTime, possessivePronoun } from "@/lib/format";
import { ENGAGEMENT_DESCRIPTIONS } from "@/lib/stages";
import type { ChatSource, ChatStreamEvent } from "@/services/ai";
import { STAGE_LABELS } from "@/types/application";
import { ENGAGEMENT_LABELS } from "@/types/event";
import type { CandidateDetail, PipelineCandidate, ScheduledInterview } from "@/types/workspace";

import { mockApi } from "./api";
import { mockDelay, newId } from "./db";

// Template answers built from the same data the recruiter sees, streamed like the real SSE endpoint.
// They stand in for POST /v1/ai/chat until the AI gateway is connected (ARCHITECTURE.md 6.9).

type Intent = "summary" | "next_steps" | "draft" | "interview" | "general";

type Context = {
  candidate: PipelineCandidate;
  detail: CandidateDetail;
  recruiter: string;
  first: string;
  their: string;
  upcoming?: ScheduledInterview;
};

export async function* mockCandidateChat(
  candidateId: string,
  message: string,
  signal?: AbortSignal,
): AsyncGenerator<ChatStreamEvent> {
  const candidate = await mockApi.getCandidate(candidateId);
  if (!candidate) {
    yield { event: "error", data: { code: "not_found", fallback: "I couldn't find that candidate. They may have been archived." } };
    return;
  }

  const [detail, user] = await Promise.all([mockApi.getCandidateDetail(candidateId), mockApi.getCurrentUser()]);
  await mockDelay(350, signal);

  const now = Date.now();
  const context: Context = {
    candidate,
    detail,
    recruiter: firstName(user.name),
    first: firstName(candidate.name),
    their: possessivePronoun(candidate.pronouns),
    upcoming: detail.interviews.find((interview) => new Date(interview.scheduledAt).getTime() > now),
  };
  const { text, sources } = COMPOSERS[detectIntent(message)](context);

  yield { event: "meta", data: { conversation_id: newId("conversation"), message_id: newId("message"), sources } };
  const words = text.match(/\S+\s*/g) ?? [];
  for (let index = 0; index < words.length; index += 3) {
    await mockDelay(18 + Math.random() * 22, signal);
    yield { event: "delta", data: { text: words.slice(index, index + 3).join("") } };
  }
  yield { event: "done", data: { stop_reason: "end", usage: { output_characters: text.length } } };
}

function detectIntent(message: string): Intent {
  const text = message.toLowerCase();
  if (/summar|overview|profile|tell me about|who is/.test(text)) return "summary";
  if (/next step|what should|recommend|suggest|plan/.test(text)) return "next_steps";
  if (/draft|write|message|email|follow[- ]?up|reach out|reply/.test(text)) return "draft";
  if (/interview|brief|prep|question/.test(text)) return "interview";
  return "general";
}

const source = (type: string, id: string, label: string): ChatSource => ({ type, id, label });

function sourcesFor({ candidate, detail }: Context, ...extra: ("activity" | "interviews" | "messages")[]): ChatSource[] {
  const list = [source("profile", candidate.id, "Profile")];
  if (extra.includes("activity") && detail.activities.length) list.push(source("activity", candidate.id, "Activity timeline"));
  if (extra.includes("interviews") && detail.interviews.length) list.push(source("interviews", candidate.id, "Interview schedule"));
  if (extra.includes("messages") && detail.messages.length) list.push(source("messages", candidate.id, "Message thread"));
  return list;
}

function recentActivity({ detail }: Context, count: number): string {
  return detail.activities
    .slice(0, count)
    .map((activity) => `${activity.label.toLowerCase()} ${formatRelativeTime(activity.occurredAt)}`)
    .join(" and ");
}

function dayPhrase(iso: string): string {
  const label = formatDayLabel(iso);
  const day = label === "Today" || label === "Tomorrow" ? label.toLowerCase() : `on ${label}`;
  return `${day} at ${formatTime(iso)}`;
}

function people(names: string[]): string {
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : (names[0] ?? "the team");
}

function nextStepLine({ candidate, upcoming }: Context): string {
  if (upcoming) return `${upcoming.title}, ${formatSchedule(upcoming.scheduledAt)} with ${people(upcoming.interviewers)}.`;
  if (candidate.nextStep) return `${candidate.nextStep.title}, ${formatSchedule(candidate.nextStep.date)}.`;
  return "nothing scheduled yet.";
}

const COMPOSERS: Record<Intent, (context: Context) => { text: string; sources: ChatSource[] }> = {
  summary(context) {
    const { candidate, detail, first } = context;
    const question = detail.activities.find((activity) => activity.kind === "question");
    const lines = [
      `**${candidate.name}** is a ${candidate.role}${candidate.location ? ` based in ${candidate.location}` : ""}, currently in the **${STAGE_LABELS[candidate.stage]}** stage.`,
      "",
      `- **Engagement: ${ENGAGEMENT_LABELS[candidate.engagement]}.** ${ENGAGEMENT_DESCRIPTIONS[candidate.engagement]}; most recently ${recentActivity(context, 2)}.`,
    ];
    if (candidate.skills.length) lines.push(`- **Skills:** ${candidate.skills.join(", ")}.`);
    lines.push(`- **Next step:** ${nextStepLine(context)}`);
    if (question) lines.push(`- **Worth covering:** ${question.label.toLowerCase()}; a good topic for the next conversation.`);
    if (candidate.followUp) lines.push(`- **Needs attention:** ${candidate.followUp.reason}.`);
    lines.push("");
    if (candidate.followUp) lines.push(`I'd prioritise a follow-up today so ${first} doesn't go cold.`);
    else if (candidate.engagement === "high") lines.push("Overall, a responsive candidate moving on schedule. No follow-up needed right now.");
    else if (candidate.engagement === "insufficient") lines.push("There isn't much signal yet. A personal outreach message is the best next move.");
    else lines.push(`Momentum is steady. A quick check-in would keep ${first} engaged.`);
    return { text: lines.join("\n"), sources: sourcesFor(context, "activity", "interviews") };
  },

  next_steps(context) {
    const { candidate, detail, first, their, upcoming } = context;
    const lastMessage = detail.messages.at(-1);
    const pendingFeedback = detail.interviews.find((interview) => interview.feedback === "pending");
    const steps: string[] = [];
    if (candidate.followUp) steps.push(`**Act today:** ${candidate.followUp.reason.toLowerCase()}.`);

    switch (candidate.stage) {
      case "sourced":
        steps.push(
          `**Send a personal outreach message** that references ${their} ${candidate.skills[0]?.toLowerCase() ?? "background"} experience and the ${candidate.role} role.`,
          `**Share the role overview** so ${first} can see the team and the problems they'd work on.`,
          "**Follow up in 3 days** if there's no reply. I can draft both messages for you.",
        );
        break;
      case "screening":
        steps.push(
          `**Review the latest update:** ${candidate.lastActivity.toLowerCase()} ${formatRelativeTime(candidate.lastActivityAt)}.`,
          upcoming
            ? `**Prepare ${people(upcoming.interviewers)}** for the ${upcoming.title.toLowerCase()} ${dayPhrase(upcoming.scheduledAt)}.`
            : "**Book a hiring-manager screen** while engagement is fresh.",
          `**Send a short update** so ${first} knows what happens next and when.`,
        );
        break;
      case "interview":
        if (upcoming) {
          steps.push(`**Brief ${people(upcoming.interviewers)}** before the ${upcoming.title.toLowerCase()} ${dayPhrase(upcoming.scheduledAt)}, and agree who covers which areas.`);
          if (lastMessage?.author === "candidate") steps.push(`**Reply to ${first}'s latest message:** "${lastMessage.body}"`);
          steps.push("**Plan the debrief:** collect written feedback within 24 hours so a decision can follow quickly.");
        } else {
          steps.push(
            pendingFeedback
              ? `**Chase feedback** from ${people(pendingFeedback.interviewers)} on the ${pendingFeedback.title.toLowerCase()}.`
              : "**Schedule the next interview round** while momentum is high.",
            `**Book a debrief** with the hiring team to decide on next steps.`,
            `**Update ${first}** on timing so the process doesn't go quiet.`,
          );
        }
        break;
      case "offer":
        steps.push(
          `**Check in on the offer:** ${first}'s latest activity was "${candidate.lastActivity.toLowerCase()}" ${formatRelativeTime(candidate.lastActivityAt)}.`,
          "**Be ready on equity, benefits and start date**; these are the usual questions at this stage.",
          candidate.nextStep
            ? `**Keep the ${candidate.nextStep.title.toLowerCase()}** ${dayPhrase(candidate.nextStep.date)} on track.`
            : "**Agree a decision date** so both sides can plan.",
        );
        break;
      case "hired":
        steps.push(
          `**Send the onboarding pack** and confirm ${their} start date${candidate.nextStep ? ` (${formatSchedule(candidate.nextStep.date)})` : ""}.`,
          `**Introduce ${first} to the team** and assign an onboarding buddy.`,
          "**Book a first-week check-in** to keep the experience smooth.",
        );
        break;
    }

    const text = [`Here's what I'd do next for ${first}:`, "", ...steps.slice(0, 4).map((step, index) => `${index + 1}. ${step}`)].join("\n");
    return { text, sources: sourcesFor(context, "activity", "interviews", "messages") };
  },

  draft(context) {
    const { candidate, detail, first, recruiter, upcoming } = context;
    const pastInterview = detail.interviews.find((interview) => interview.status === "completed");
    let subject: string;
    let body: string;

    switch (candidate.stage) {
      case "sourced":
        subject = `${candidate.role} at Encord`;
        body = `I came across your work in ${people(candidate.skills.slice(0, 2).map((skill) => skill.toLowerCase()))} and thought you'd be a great fit for our ${candidate.role} role. We're building the data layer for physical AI, and the team is growing.\n\nWould you be open to a 20-minute chat this week?`;
        break;
      case "screening":
        subject = `Next steps for your ${candidate.role} application`;
        body = candidate.followUp
          ? "Just checking in on the assessment I sent over. No pressure at all; if you need more time, let me know and we can adjust the deadline."
          : "Thanks for your time so far. The team is reviewing your application, and I'll be in touch about next steps in the next few days.\n\nIn the meantime, let me know if you have any questions about the role or the team.";
        break;
      case "interview":
        if (upcoming) {
          subject = `Your ${upcoming.title.toLowerCase()} ${dayPhrase(upcoming.scheduledAt)}`;
          body = `Looking forward to your ${upcoming.title.toLowerCase()} ${dayPhrase(upcoming.scheduledAt)} with ${people(upcoming.interviewers)}.\n\nTo help you prepare: the session is ${formatDuration(upcoming.durationMinutes)} (${upcoming.format === "onsite" ? "at our London office" : upcoming.format === "phone" ? "by phone" : "over video"}), and the conversation will focus on ${people(candidate.skills.slice(0, 2).map((skill) => skill.toLowerCase()))}. Your prep materials are in the candidate portal.\n\nIf anything comes up, just reply here.`;
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

    const text = `Here's a draft you can edit before sending:\n\n**Subject:** ${subject}\n\nHi ${first},\n\n${body}\n\nBest,\n${recruiter}`;
    return { text, sources: sourcesFor(context, "interviews", "messages") };
  },

  interview(context) {
    const { candidate, detail, upcoming } = context;
    const questions = detail.activities.filter((activity) => activity.kind === "question").map((activity) => activity.label.toLowerCase());
    const lines = [
      `Interview brief for **${candidate.name}**${upcoming ? `: ${upcoming.title}, ${formatSchedule(upcoming.scheduledAt)}` : ""}.`,
      "",
      `- **Focus areas:** ${candidate.skills.slice(0, 3).join(", ") || "role fundamentals"}.`,
      `- **Candidate questions:** ${questions.length ? questions.join("; ") : "none raised yet"}.`,
      `- **Recent signals:** ${recentActivity(context, 2)}.`,
    ];
    if (upcoming) {
      lines.push(`- **Logistics:** ${formatDuration(upcoming.durationMinutes)} · ${upcoming.format} · ${people(upcoming.interviewers)}.`);
    }
    return { text: lines.join("\n"), sources: sourcesFor(context, "activity", "interviews") };
  },

  general(context) {
    const { candidate, their } = context;
    const text = [
      `Here's the latest on **${candidate.name}** (${candidate.role}, ${STAGE_LABELS[candidate.stage]}):`,
      "",
      `- **Last activity:** ${candidate.lastActivity} ${formatRelativeTime(candidate.lastActivityAt)}.`,
      `- **Engagement:** ${ENGAGEMENT_LABELS[candidate.engagement]}. ${ENGAGEMENT_DESCRIPTIONS[candidate.engagement]}.`,
      `- **Next step:** ${nextStepLine(context)}`,
      "",
      `I can summarize ${their} profile, suggest next steps, draft a message, or prepare an interview brief.`,
    ].join("\n");
    return { text, sources: sourcesFor(context, "activity") };
  },
};
