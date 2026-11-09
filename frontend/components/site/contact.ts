import type { ContactTopic } from "@/services/contact";

/*
 * Hirvello's public addresses. They're written here rather than fetched, so the footer and the contact page show
 * them on every static page. Both are Zoho distribution groups that only receive mail: the contact form doesn't
 * send from them, the backend emails them (CONTACT_BUSINESS_EMAIL and CONTACT_SUPPORT_EMAIL, which default to
 * these same two).
 */
export const BUSINESS_EMAIL = "business@hirvello.com";
export const SUPPORT_EMAIL = "support@hirvello.com";

/** The two ways to reach Hirvello: each its topic on the form, who it's for, and its own address. */
export const CONTACT_CHANNELS: { topic: ContactTopic; title: string; team: string; text: string; email: string }[] = [
  { topic: "general", title: "Business inquiries", team: "business team", text: "Partnerships, investors and sales.", email: BUSINESS_EMAIL },
  { topic: "support", title: "Customer support", team: "support team", text: "Help with your account, or something that isn't working.", email: SUPPORT_EMAIL },
];

/**
 * The founders, as About introduces them: name, role and work address only. No phone numbers, personal addresses
 * or profiles: their work email is the professional way to reach them.
 */
export const FOUNDERS = [
  { name: "Subhash Galla", role: "Founder & CEO", email: "subhash@hirvello.com" },
  { name: "Jordan Curri", role: "Co-founder", email: "jordan.curri@hirvello.com" },
] as const;
