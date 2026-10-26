import { USE_MOCK_API, apiFetch } from "@/services/api";

// The public website's contact form (backend /contact): public, no sign-in.

export type ContactTopic = "product" | "pilot" | "support" | "partnerships" | "general";

export const CONTACT_TOPICS: { value: ContactTopic; label: string }[] = [
  { value: "product", label: "Product questions" },
  { value: "pilot", label: "Pilot / design partnership" },
  { value: "support", label: "Support" },
  { value: "partnerships", label: "Partnerships" },
  { value: "general", label: "General inquiry" },
];

export type ContactMessage = {
  name: string;
  email: string;
  company: string;
  topic: ContactTopic;
  message: string;
  /** The hidden field people never fill in. */
  website: string;
};

/** TalentBridge's official contact address, when one is configured (CONTACT_EMAIL); never a made-up one. */
export async function getContactEmail(): Promise<string | null> {
  if (USE_MOCK_API) return null;
  try {
    return (await apiFetch<{ email: string | null }>("/contact")).email;
  } catch {
    return null; // the section still works without it: the form is the way to reach us
  }
}

export async function sendContactMessage(message: ContactMessage): Promise<void> {
  await apiFetch("/contact", {
    method: "POST",
    body: JSON.stringify({
      name: message.name.trim(),
      email: message.email.trim(),
      company: message.company.trim() || null,
      topic: message.topic,
      message: message.message.trim(),
      website: message.website || null,
    }),
  });
}
