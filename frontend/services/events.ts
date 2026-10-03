import { apiFetch } from "@/services/api";
import type { ClientEventType } from "@/types/event";

// Telemetry only: the server accepts the 7 client-emittable types and derives ids itself (ARCHITECTURE.md 9.3).
export function trackEvent(
  eventType: ClientEventType,
  applicationId?: string,
  metadata: Record<string, unknown> = {},
) {
  return apiFetch<void>("/events", {
    method: "POST",
    keepalive: true,
    body: JSON.stringify({ event_type: eventType, application_id: applicationId ?? null, metadata }),
  });
}
