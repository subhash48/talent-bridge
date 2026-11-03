/*
 * The home page's concierge is an intent router, not a chatbot. It reads what a visitor types for whether they're
 * a recruiter, a small-business owner or a job seeker, and opens that sign-in or onboarding flow. It's a short list
 * of phrases, read in the browser: no model, no request, nothing stored. When the words don't say which, the page
 * asks instead of guessing. Nothing here grants anything: the flows it opens ask people to sign in as they always
 * have, and their role comes from their account, never from what they typed.
 */

export type Intent = "recruiter" | "small_business" | "candidate";

/** Where each intent leads: the flows that already exist. Employers share one sign-in; Simple Hire keeps its own onboarding. */
export const INTENT_PATHS: Record<Intent, string> = {
  recruiter: "/login?as=employer",
  small_business: "/signup/employer?mode=simple",
  candidate: "/login?as=candidate",
};

/** As much as the concierge reads: a sentence or two, not a résumé. */
export const INTENT_MAX_LENGTH = 240;

/** Lower case, no accents (café → cafe), contractions opened (I'm → i am), punctuation out, one space between words. */
export function normalizeIntentText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[‘’`]/g, "'")
    .replace(/\b(\w+)'m\b/g, "$1 am")
    .replace(/\b(\w+)'re\b/g, "$1 are")
    .replace(/\b(\w+)'ve\b/g, "$1 have")
    .replace(/\b(\w+)'ll\b/g, "$1 will")
    .replace(/\b(\w+)'d\b/g, "$1 would")
    .replace(/\bcan't\b/g, "can not")
    .replace(/\bwon't\b/g, "will not")
    .replace(/\b(\w+)n't\b/g, "$1 not")
    .replace(/\b(\w+)'s\b/g, "$1")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
