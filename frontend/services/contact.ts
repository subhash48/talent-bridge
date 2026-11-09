import { apiFetch } from "@/services/api";

// The public website's contact form (backend /contact): public, no sign-in. The backend picks the team from the
// topic (support, or business for everything else); the browser never says where the mail goes.

export type ContactTopic = "product" | "pilot" | "support" | "partnerships" | "general";

// The same limits the API checks.
export const MAX_SUBJECT = 150;
export const MAX_MESSAGE = 4800;

export type ContactMessage = {
  name: string;
  email: string;
  company: string;
  topic: ContactTopic;
  subject: string;
  message: string;
  /** The hidden field people never fill in. */
  website: string;
};

export async function sendContactMessage(message: ContactMessage): Promise<void> {
  await apiFetch("/contact", {
    method: "POST",
    body: JSON.stringify({
      name: message.name.trim(),
      email: message.email.trim(),
      company: message.company.trim() || null,
      topic: message.topic,
      subject: message.subject.trim(),
      message: message.message.trim(),
      website: message.website || null,
    }),
  });
}
