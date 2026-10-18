import type {
  AttentionList,
  CommunicationAnalytics,
  CommunicationHealth,
  CommunicationRule,
  CommunicationRuleSetting,
  DraftReason,
  UpdateDraft,
} from "@/types/communication";
import type { ThreadMessage } from "@/types/workspace";

import { mockDraftMessage } from "./ai";
import { mockApi } from "./api";
import { getMockDb, mockDelay, newId } from "./db";

// Mock mode's communication: the seeded follow-ups stand in for the SLA rules, drafts come from the
// template drafts, and sending posts to the mock thread. Email is never configured here.

const RULES: CommunicationRuleSetting[] = [
  {
    key: "stage_update",
    title: "Status changed, candidate not told",
    description: "The application moved to a new stage and the candidate hasn't had a message since.",
    unit: "hours after the stage change",
    enabled: true,
    thresholdHours: 0,
    defaultHours: 0,
  },
  {
    key: "unanswered_question",
    title: "Unanswered message",
    description: "The candidate wrote (anything but a thank-you note) and nobody has replied.",
    unit: "hours after their message",
    enabled: true,
    thresholdHours: 24,
    defaultHours: 24,
  },
  {
    key: "post_interview",
    title: "Interview done, no follow-up",
    description: "An interview ended and the candidate hasn't heard from you since.",
    unit: "hours after the interview ended",
    enabled: true,
    thresholdHours: 72,
    defaultHours: 72,
  },
  {
    key: "interview_unconfirmed",
    title: "Interview not confirmed",
    description: "An interview is coming up and the candidate hasn't confirmed it. A reminder clears it.",
    unit: "hours before the interview",
    enabled: true,
    thresholdHours: 24,
    defaultHours: 24,
  },
  {
    key: "no_recent_update",
    title: "No update in a while",
    description: "An active application has had no message from you, and no interview is booked.",
    unit: "hours since the last update (or since they applied)",
    enabled: true,
    thresholdHours: 120,
    defaultHours: 120,
  },
];

const drafts = new Map<string, UpdateDraft>();

export const mockCommunication = {
  async getAttention(): Promise<AttentionList> {
    const now = new Date().toISOString();
    const items = getMockDb()
      .candidates.filter((candidate) => candidate.communication.status === "needs_attention")
      .map((candidate) => ({
        applicationId: candidate.id,
        candidateId: candidate.candidateId,
        name: candidate.name,
        role: candidate.role,
        avatarUrl: candidate.avatarUrl,
        stage: candidate.stage,
        candidateStatus: candidate.stage === "sourced" ? "Applied" : candidate.stage[0].toUpperCase() + candidate.stage.slice(1),
        lastUpdateAt: candidate.communication.lastUpdateAt,
        daysSinceUpdate: candidate.communication.daysSinceUpdate,
        reasons: [
          {
            rule: "no_recent_update" as const,
            title: "No update in a while",
            detail: candidate.communication.reason ?? "No update since your last message",
            since: candidate.lastActivityAt,
            dueAt: now,
          },
        ],
        draft: [...drafts.values()].find((draft) => draft.applicationId === candidate.id && draft.status === "drafted"),
      }));
    return { items, counts: { no_recent_update: items.length }, upcoming: 0 };
  },

  async getHealth(applicationId: string): Promise<CommunicationHealth | null> {
    const candidate = getMockDb().candidates.find((item) => item.id === applicationId);
    if (!candidate) return null;
    return {
      status: candidate.communication.status,
      candidateStatus: candidate.stage === "sourced" ? "Applied" : candidate.stage[0].toUpperCase() + candidate.stage.slice(1),
      lastUpdateAt: candidate.communication.lastUpdateAt,
      waitingSince: candidate.lastActivityAt,
      daysSinceUpdate: candidate.communication.daysSinceUpdate,
      attention: candidate.communication.reason
        ? [
            {
              rule: "no_recent_update",
              title: "No update in a while",
              detail: candidate.communication.reason,
              since: candidate.lastActivityAt,
              dueAt: new Date().toISOString(),
            },
          ]
        : [],
    };
  },

  async draftUpdate(applicationId: string, reason?: DraftReason, signal?: AbortSignal): Promise<UpdateDraft> {
    const { subject, body } = await mockDraftMessage(applicationId, signal);
    for (const draft of drafts.values()) {
      if (draft.applicationId === applicationId && draft.status === "drafted") draft.status = "discarded";
    }
    const draft: UpdateDraft = {
      id: newId("draft"),
      applicationId,
      reason: reason ?? "no_recent_update",
      status: "drafted",
      subject,
      body,
      edited: false,
      modelName: "mock",
      createdAt: new Date().toISOString(),
    };
    drafts.set(draft.id, draft);
    return { ...draft };
  },

  async sendDraft(draftId: string, subject: string, body: string): Promise<{ draft: UpdateDraft; message: ThreadMessage }> {
    const draft = drafts.get(draftId);
    if (!draft || draft.status !== "drafted") throw new Error("This draft was already sent or discarded.");
    const message = await mockApi.sendMessage(draft.applicationId, body);
    Object.assign(draft, { status: "sent", edited: draft.edited || body !== draft.body || subject !== draft.subject, subject, body });
    const candidate = getMockDb().candidates.find((item) => item.id === draft.applicationId);
    if (candidate) candidate.communication = { status: "on_track", daysSinceUpdate: 0, lastUpdateAt: message.sentAt };
    return {
      draft: { ...draft },
      message: { ...message, delivery: { subject, emailStatus: "not_configured" } },
    };
  },

  async discardDraft(draftId: string): Promise<void> {
    const draft = drafts.get(draftId);
    if (draft) draft.status = "discarded";
  },

  async getRules(): Promise<CommunicationRuleSetting[]> {
    return RULES.map((rule) => ({ ...rule }));
  },

  async updateRule(key: CommunicationRule, enabled: boolean, thresholdHours: number): Promise<CommunicationRuleSetting> {
    await mockDelay(200);
    const rule = RULES.find((item) => item.key === key);
    if (!rule) throw new Error("Unknown rule.");
    Object.assign(rule, { enabled, thresholdHours });
    return { ...rule };
  },

  async getAnalytics(days: number): Promise<CommunicationAnalytics> {
    const candidates = getMockDb().candidates;
    const needsAttention = candidates.filter((candidate) => candidate.communication.status === "needs_attention").length;
    const sent = [...drafts.values()].filter((draft) => draft.status === "sent");
    return {
      days,
      needsAttention,
      unansweredMessages: 0,
      medianHoursBetweenUpdates: 52,
      slaCompliance: candidates.length ? (candidates.length - needsAttention) / candidates.length : null,
      compliance: [],
      interviewConfirmationRate: null,
      interviewsConfirmed: 0,
      interviewsTotal: 0,
      updatesSent: sent.length,
      emailsSent: 0,
      emailsFailed: 0,
      draftsGenerated: drafts.size,
      draftsSent: sent.length,
      draftsSentUnedited: sent.filter((draft) => !draft.edited).length,
      draftsDiscarded: [...drafts.values()].filter((draft) => draft.status === "discarded").length,
      minutesSaved: sent.length * 5,
      minutesSavedPerDraft: 5,
    };
  },
};
