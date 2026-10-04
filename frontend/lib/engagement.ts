import { apiFetch } from "@/services/api";

// The candidate portal's activity reports: the only place in the frontend that sends them.
//
// What is sent, and nothing else:
// - a visit starting and ending, and a heartbeat about every 30 seconds while this tab is visible
//   and has been used in the last two minutes. The server times the gaps itself, so a hidden tab, an
//   idle computer or a page left open overnight adds nothing;
// - which portal pages and items were opened (a page, an application, an interview), in batches.
//
// Never sent or kept: keystrokes, text, pointer positions, scrolling, browser or device details, or
// anything outside this portal. Input events only refresh an in-memory "used recently" time.
//
// The candidate never sees what the hiring team makes of it, and it is never used to rank or reject.

const HEARTBEAT_MS = 30_000;
const IDLE_MS = 2 * 60_000;
const FLUSH_MS = 3_000;
const MAX_BATCH = 20;
const VISIT_EXPIRES_MS = 30 * 60_000;
const VISIT_KEY = "tb.portal-visit";
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "scroll", "touchstart"] as const;

export type PortalPage = "dashboard" | "application" | "interviews" | "messages" | "prep" | "profile";

export type PortalAction =
  | { type: "page_view"; page: PortalPage }
  | { type: "application_viewed" }
  | { type: "interview_viewed"; interviewId: string };

type WireEvent = {
  type: PortalAction["type"];
  application_id: string;
  session_id: string;
  page?: PortalPage;
  interview_id?: string;
};

class PortalEngagement {
  private applicationId: string | null = null;
  private visitId = "";
  private lastUsed = 0;
  private queue: WireEvent[] = [];
  private heartbeatTimer: number | undefined;
  private flushTimer: number | undefined;

  /** Begin reporting for the application the portal is showing. Safe to call again. */
  start(applicationId: string): void {
    if (typeof window === "undefined") return;
    if (this.applicationId === applicationId && this.heartbeatTimer !== undefined) return;
    const first = this.heartbeatTimer === undefined;
    if (!first) this.endVisit();
    this.applicationId = applicationId;
    this.visitId = currentVisit();
    this.lastUsed = Date.now();
    this.send("/candidate/engagement/sessions", this.visit());
    if (first) {
      ACTIVITY_EVENTS.forEach((name) => window.addEventListener(name, this.markUsed, { passive: true }));
      document.addEventListener("visibilitychange", this.onVisibility);
      window.addEventListener("pagehide", this.onHide);
    }
    window.clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = window.setInterval(() => this.heartbeat(), HEARTBEAT_MS);
  }

  /** Stop reporting (the portal unmounted, or the candidate signed out). */
  stop(): void {
    if (this.heartbeatTimer === undefined) return;
    this.endVisit();
    window.clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = undefined;
    ACTIVITY_EVENTS.forEach((name) => window.removeEventListener(name, this.markUsed));
    document.removeEventListener("visibilitychange", this.onVisibility);
    window.removeEventListener("pagehide", this.onHide);
    this.applicationId = null;
  }

  /** Record an explicit portal action. Batched; repeats are dropped by the server. */
  track(action: PortalAction): void {
    if (!this.applicationId) return;
    const event: WireEvent = { type: action.type, application_id: this.applicationId, session_id: this.visitId };
    if (action.type === "page_view") event.page = action.page;
    if (action.type === "interview_viewed") event.interview_id = action.interviewId;
    this.queue.push(event);
    if (this.queue.length >= MAX_BATCH) this.flush();
    else if (this.flushTimer === undefined) this.flushTimer = window.setTimeout(() => this.flush(), FLUSH_MS);
  }

  private heartbeat(): void {
    if (!this.applicationId || document.visibilityState !== "visible") return;
    if (Date.now() - this.lastUsed > IDLE_MS) return; // left alone: stop counting
    touchVisit(this.visitId);
    this.send("/candidate/engagement/heartbeat", this.visit());
  }

  private endVisit(): void {
    this.flush(true);
    if (this.applicationId) this.send("/candidate/engagement/sessions/end", this.visit(), true);
  }

  private flush(keepalive = false): void {
    window.clearTimeout(this.flushTimer);
    this.flushTimer = undefined;
    if (this.queue.length === 0) return;
    const events = this.queue.splice(0, MAX_BATCH);
    this.send("/candidate/engagement/events", { events }, keepalive);
    if (this.queue.length) this.flush(keepalive);
  }

  private visit() {
    return { session_id: this.visitId, application_id: this.applicationId };
  }

  private send(path: string, body: unknown, keepalive = false): void {
    // Reporting must never get in the candidate's way: failures are dropped silently.
    void apiFetch<void>(path, { method: "POST", body: JSON.stringify(body), keepalive }).catch(() => undefined);
  }

  private markUsed = () => {
    this.lastUsed = Date.now();
  };

  private onVisibility = () => {
    if (document.visibilityState === "hidden") {
      // Count the stretch since the last heartbeat, then nothing while hidden.
      this.heartbeat();
      this.flush(true);
      return;
    }
    this.lastUsed = Date.now();
    const visit = currentVisit();
    if (visit !== this.visitId && this.applicationId) {
      this.visitId = visit; // away long enough to make this a new visit
      this.send("/candidate/engagement/sessions", this.visit());
    }
  };

  private onHide = () => this.endVisit();
}

/** This tab's visit id: kept across reloads, renewed after half an hour away. */
function currentVisit(): string {
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(VISIT_KEY) ?? "null") as { id: string; at: number } | null;
    if (saved && Date.now() - saved.at < VISIT_EXPIRES_MS) return saved.id;
  } catch {
    // Storage unavailable or corrupted: a new visit.
  }
  const id = crypto.randomUUID();
  touchVisit(id);
  return id;
}

function touchVisit(id: string): void {
  try {
    window.sessionStorage.setItem(VISIT_KEY, JSON.stringify({ id, at: Date.now() }));
  } catch {
    // Not stored: the next reload starts a new visit, which is all that's lost.
  }
}

export const engagement = new PortalEngagement();

/** The portal page a path belongs to, for page views. */
export function portalPage(pathname: string): PortalPage {
  const section = pathname.split("/")[2];
  switch (section) {
    case "application":
    case "interviews":
    case "messages":
    case "prep":
    case "profile":
      return section;
    default:
      return "dashboard";
  }
}
