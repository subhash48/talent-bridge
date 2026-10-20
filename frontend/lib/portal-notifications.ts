import { DURATION, firstName, formatSchedule } from "@/lib/format";
import type { CandidateMeResponse } from "@/types/portal";

export type PortalNotification = {
  id: string;
  kind: "message" | "interview" | "stage";
  title: string;
  description?: string;
  href: string;
  /** Needs the candidate to do something: read a message or confirm an interview. */
  attention: boolean;
  /** About another of the candidate's applications: opening it makes that one the portal's application. */
  applicationId?: string;
};

/**
 * Notifications derived from /candidate/me rather than stored: unread messages, the next interview
 * and recent stage changes for the application on screen, then unread messages and interviews this
 * week for the candidate's other applications. Only items that need action count towards the bell's badge.
 */
export function portalNotifications(me: CandidateMeResponse, now = Date.now()): PortalNotification[] {
  const items: PortalNotification[] = [];
  const message = me.latestMessage;
  if (me.unreadMessages > 0 && message) {
    const from = message.sender === "system" ? message.senderName : firstName(message.senderName);
    items.push({
      id: `message:${message.id}`,
      kind: "message",
      title: me.unreadMessages === 1 ? `New message from ${from}` : `${me.unreadMessages} new messages from ${from}`,
      description: message.body,
      href: "/candidate/messages",
      attention: true,
    });
  }

  const interview = me.nextInterview;
  if (interview?.canConfirm) {
    items.push({
      id: `confirm:${interview.id}`,
      kind: "interview",
      title: `Please confirm your ${interview.title}`,
      description: formatSchedule(interview.scheduledAt),
      href: "/candidate/interviews",
      attention: true,
    });
  } else if (interview && new Date(interview.scheduledAt).getTime() - now < 7 * DURATION.DAY) {
    items.push({
      id: `upcoming:${interview.id}`,
      kind: "interview",
      title: `${interview.title}: ${formatSchedule(interview.scheduledAt)}`,
      description: interview.confirmedAt ? "Confirmed. Your prep is ready." : undefined,
      href: `/candidate/prep?interview=${interview.id}`,
      attention: false,
    });
  }

  const stageChange = me.recentActivity.find((activity) => activity.kind === "stage");
  if (stageChange && now - new Date(stageChange.occurredAt).getTime() < 14 * DURATION.DAY) {
    items.push({
      id: `stage:${stageChange.id}`,
      kind: "stage",
      // "Moved to Interview" reads as "Application moved to Interview".
      title:
        stageChange.title === "Application closed"
          ? "Your application was closed"
          : `Application ${stageChange.title.charAt(0).toLowerCase()}${stageChange.title.slice(1)}`,
      href: "/candidate/application",
      attention: false,
    });
  }

  for (const other of me.applications) {
    if (other.id === me.application?.id) continue;
    if (other.unreadMessages > 0) {
      items.push({
        id: `message:${other.id}:${other.unreadMessages}`,
        kind: "message",
        title: `${other.unreadMessages === 1 ? "New message" : `${other.unreadMessages} new messages`} from ${other.company}`,
        description: `About your ${other.jobTitle} application`,
        href: "/candidate/messages",
        attention: true,
        applicationId: other.id,
      });
    }
    if (other.nextInterviewAt && new Date(other.nextInterviewAt).getTime() - now < 7 * DURATION.DAY) {
      items.push({
        id: `upcoming:${other.id}:${other.nextInterviewAt}`,
        kind: "interview",
        title: `${other.company} interview: ${formatSchedule(other.nextInterviewAt)}`,
        description: other.jobTitle,
        href: "/candidate/interviews",
        attention: false,
        applicationId: other.id,
      });
    }
  }
  return items;
}

/** Changes whenever something new needs action, so the badge comes back after it was dismissed. */
export function attentionKey(me: CandidateMeResponse): string {
  const parts = [];
  if (me.unreadMessages > 0 && me.latestMessage) parts.push(`message:${me.latestMessage.id}`);
  if (me.nextInterview?.canConfirm) parts.push(`confirm:${me.nextInterview.id}`);
  for (const other of me.applications) {
    if (other.id !== me.application?.id && other.unreadMessages > 0) parts.push(`message:${other.id}:${other.unreadMessages}`);
  }
  return parts.join("|");
}
