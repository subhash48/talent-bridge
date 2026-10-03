import { STAGE_LABELS } from "@/types/application";
import type { EngagementSignal } from "@/types/event";
import type {
  CandidateActivity,
  CandidateDetail,
  CandidateStage,
  Conversation,
  NewCandidateInput,
  PipelineCandidate,
  ThreadMessage,
} from "@/types/workspace";

import { getMockDb, mockDelay, newId } from "./db";

// Mock implementations of the staff façade. Each method mirrors a service function in
// services/*.ts and returns copies, so React state never aliases the mock database.

const clone = <T>(value: T): T => structuredClone(value);

function findCandidate(id: string): PipelineCandidate {
  const candidate = getMockDb().candidates.find((item) => item.id === id);
  if (!candidate) throw new Error(`Candidate ${id} not found`);
  return candidate;
}

function recordActivity(candidate: PipelineCandidate, kind: CandidateActivity["kind"], label: string) {
  const occurredAt = new Date().toISOString();
  getMockDb().activities.push({ id: newId("activity"), candidateId: candidate.id, kind, label, occurredAt });
  candidate.lastActivity = label;
  candidate.lastActivityAt = occurredAt;
}

function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function engagementSignals(candidate: PipelineCandidate, activities: CandidateActivity[]): EngagementSignal[] {
  const signals: EngagementSignal[] = activities
    .filter((activity) => ["interview", "document", "question", "assessment"].includes(activity.kind))
    .slice(0, 3)
    .map((activity) => ({
      key: activity.id,
      label: activity.label,
      polarity: "positive",
      observed_at: activity.occurredAt,
    }));
  if (candidate.followUp) {
    signals.unshift({ key: "follow-up", label: candidate.followUp.reason, polarity: "negative", observed_at: null });
  }
  return signals;
}

export const mockApi = {
  async getCurrentUser() {
    return clone(getMockDb().user);
  },

  async getDashboardSummary() {
    return { trends: clone(getMockDb().trends) };
  },

  async getCandidates() {
    return clone(getMockDb().candidates);
  },

  async getCandidate(id: string) {
    return clone(getMockDb().candidates.find((candidate) => candidate.id === id) ?? null);
  },

  async createCandidate(input: NewCandidateInput) {
    await mockDelay(500);
    const db = getMockDb();
    const name = `${input.firstName.trim()} ${input.lastName.trim()}`;
    const email = input.email.trim().toLowerCase();
    if (db.candidates.some((candidate) => candidate.email === email)) {
      throw new Error("A candidate with this email is already in the pipeline.");
    }
    const now = new Date().toISOString();
    const candidate: PipelineCandidate = {
      id: `${slugify(name)}-${crypto.randomUUID().slice(0, 4)}`,
      name,
      email,
      role: input.role,
      location: input.location.trim() || undefined,
      stage: input.stage,
      lastActivity: "Added to pipeline",
      lastActivityAt: now,
      engagement: "insufficient",
      skills: [],
      addedAt: now,
    };
    db.candidates.unshift(candidate);
    db.activities.push({ id: newId("activity"), candidateId: candidate.id, kind: "sourced", label: "Added to pipeline", occurredAt: now });
    return clone(candidate);
  },

  async updateCandidateStage(id: string, stage: CandidateStage) {
    await mockDelay(300);
    const candidate = findCandidate(id);
    candidate.stage = stage;
    recordActivity(candidate, "stage", `Moved to ${STAGE_LABELS[stage]}`);
    return clone(candidate);
  },

  async archiveCandidate(id: string) {
    await mockDelay(250);
    const db = getMockDb();
    const index = db.candidates.findIndex((candidate) => candidate.id === id);
    if (index === -1) throw new Error(`Candidate ${id} not found`);
    db.archived.push(...db.candidates.splice(index, 1));
  },

  async restoreCandidate(id: string) {
    await mockDelay(250);
    const db = getMockDb();
    const index = db.archived.findIndex((candidate) => candidate.id === id);
    if (index === -1) throw new Error(`Candidate ${id} is not archived`);
    const [candidate] = db.archived.splice(index, 1);
    db.candidates.push(candidate);
    return clone(candidate);
  },

  async getCandidateActivities(id: string) {
    return clone(
      getMockDb()
        .activities.filter((activity) => activity.candidateId === id)
        .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
    );
  },

  async getCandidateDetail(id: string): Promise<CandidateDetail> {
    await mockDelay(350);
    const db = getMockDb();
    const candidate = findCandidate(id);
    const activities = await mockApi.getCandidateActivities(id);
    const now = Date.now();
    const interviews = db.interviews
      .filter((interview) => interview.candidate.id === id)
      .sort((a, b) => {
        const aUpcoming = new Date(a.scheduledAt).getTime() > now;
        const bUpcoming = new Date(b.scheduledAt).getTime() > now;
        if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1;
        return aUpcoming ? a.scheduledAt.localeCompare(b.scheduledAt) : b.scheduledAt.localeCompare(a.scheduledAt);
      });
    const messages = db.conversations.find((conversation) => conversation.candidate.id === id)?.messages ?? [];
    return clone({ activities, interviews, messages, signals: engagementSignals(candidate, activities) });
  },

  async getJobs() {
    return clone(getMockDb().jobs);
  },

  async getJob(id: string) {
    return clone(getMockDb().jobs.find((job) => job.id === id) ?? null);
  },

  async getInterviews() {
    return clone(getMockDb().interviews).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  },

  async getConversations() {
    const latest = (conversation: Conversation) => conversation.messages.at(-1)?.sentAt ?? "";
    return clone(getMockDb().conversations).sort((a, b) => latest(b).localeCompare(latest(a)));
  },

  async getUnreadThreadCount() {
    return getMockDb().conversations.filter((conversation) => conversation.unread > 0).length;
  },

  async sendMessage(candidateId: string, body: string): Promise<ThreadMessage> {
    await mockDelay(400);
    const db = getMockDb();
    const message: ThreadMessage = { id: newId("message"), author: "recruiter", body, sentAt: new Date().toISOString() };
    const conversation = db.conversations.find((item) => item.candidate.id === candidateId);
    if (conversation) {
      conversation.messages.push(message);
    } else {
      const { id, name, role } = findCandidate(candidateId);
      db.conversations.push({ candidate: { id, name, role }, unread: 0, messages: [message] });
    }
    return clone(message);
  },

  async markConversationRead(candidateId: string) {
    const conversation = getMockDb().conversations.find((item) => item.candidate.id === candidateId);
    if (conversation) conversation.unread = 0;
  },
};
