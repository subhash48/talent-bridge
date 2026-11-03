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

type Rule = { re: RegExp; weight: number; jobWords?: true };

const JOB_WORDS =
  "(?:job|jobs|work|position|positions|role|roles|internship|internships|employment|career|careers|opportunity|opportunities|opening|openings|gig|gigs|vacancy|vacancies)";
const FEW_WORDS = "(?:\\w+ ){0,3}";

// Someone looking for work. The job-word rules are skipped when the job is being posted or filled, not sought.
const CANDIDATE: Rule[] = [
  { re: new RegExp(`\\b(?:looking|searching|seeking|hunting|look|search) for (?:a |an |my |some |new |any )?${FEW_WORDS}${JOB_WORDS}\\b`), weight: 2, jobWords: true },
  { re: new RegExp(`\\b(?:find|get|land|need|want|wanted|secure) (?:me )?(?:a |an |some |new |my |any )?${FEW_WORDS}${JOB_WORDS}\\b`), weight: 2, jobWords: true },
  { re: /\b(?:apply|applying|applied)\b/, weight: 2 },
  { re: /\bmy (?:application|applications|resume|cv)\b/, weight: 2 },
  {
    re: /\b(?:hire me|get hired|job ?seekers?|unemployed|job (?:search|hunt|hunting|offers?)|career (?:change|move)|internships?|interview (?:prep|preparation|practice|tips)|entry level|freshers?|new grad|recent graduate|first job|part time work|full time work|remote work|work from home|freelance work)\b/,
    weight: 2,
  },
  { re: /\b(?:i|we) (?:want|would like|need|am looking|am searching) to (?:work|join|get hired)\b/, weight: 2 },
  { re: /\b(?:resume|cv|cover letter|portfolio)\b/, weight: 1 },
];

// Someone who hires at a company: recruiters, hiring managers, people teams, agencies.
const RECRUITER: Rule[] = [
  { re: /\brecruit(?:er|ers|ing|ment)\b/, weight: 2 },
  {
    re: /\b(?:talent acquisition|hiring manager|hiring team|head of people|people ops|people team|hr|human resources|staffing agency|recruitment agency|agency|headhunter|headhunting|executive search)\b/,
    weight: 2,
  },
  { re: /\b(?:shortlist|shortlisting|shortlisted|pipeline|pipelines|screen|screening|source|sourcing|vet|vetting|interview loop|applicant tracking|ats)\b/, weight: 2 },
  { re: /\b(?:multiple|several|many|various|different) (?:companies|clients|roles|positions|openings|teams|departments)\b/, weight: 2 },
  { re: /\bour (?:company|team|teams|organization|organisation|firm|startup|clients?|engineering team|sales team|department|open roles|roles|positions|openings)\b/, weight: 2 },
  { re: /\bthe (?:company|team|organization|organisation|firm)\b/, weight: 1 },
  { re: /\bqualified (?:\w+ ){0,2}(?:candidates|engineers|developers|people|applicants|professionals|staff|talent)\b/, weight: 1 },
  { re: /\b(?:candidates|applicants|resumes|cvs)\b/, weight: 1 },
  { re: /\b(?:software engineers|developers|engineers|designers|data scientists|product managers|salespeople|sales reps|account executives)\b/, weight: 1 },
  { re: /\bfill (?:a |an |our |the |some |several )?(?:\w+ ){0,2}(?:role|roles|position|positions|opening|openings|reqs?|requisitions?)\b/, weight: 1 },
  { re: /\b(?:job descriptions?|job reqs?|open roles|open positions|open reqs|headcount)\b/, weight: 1 },
];

const BUSINESS =
  "(?:business|shop|store|restaurant|cafe|coffee shop|bakery|bar|pub|diner|food truck|salon|barbershop|spa|gym|studio|clinic|practice|pharmacy|garage|workshop|boutique|hotel|motel|inn|farm|nursery|daycare|day care|school|office|warehouse|kitchen|startup|company|firm|franchise|storefront|stall|law firm|accounting firm|dental practice)";

// Someone who owns or runs a place and needs hands.
const SMALL_BUSINESS: Rule[] = [
  { re: new RegExp(`\\bsmall ${BUSINESS}\\b`), weight: 2 },
  { re: /\bsmall (?:businesses|biz|team|companies)\b/, weight: 2 },
  { re: /\b(?:i|we) (?:own|run|operate|opened|started|founded|manage|am opening|am starting|are opening|are starting) (?:a |an |my |our |the |two |three )/, weight: 2 },
  { re: new RegExp(`\\bmy (?:\\w+ )?${BUSINESS}\\b`), weight: 2 },
  { re: /\b(?:owners?|proprietor|sole trader|sole proprietor|self employed|family business|family run|family owned|local business|mom and pop|main street)\b/, weight: 2 },
  {
    re: /\b(?:cashiers?|baristas?|waiters?|waitress|servers?|line cooks?|cooks?|chefs?|dishwashers?|cleaners?|housekeepers?|receptionists?|front desk|delivery drivers?|drivers?|shop assistants?|sales assistants?|store managers?|weekend staff|part time staff|seasonal staff|nanny|babysitter|handyman|mechanics?|apprentices?)\b/,
    weight: 1,
  },
];

// Hiring words that any employer uses: they say which side, not which kind.
const EMPLOYER: Rule[] = [
  { re: /\b(?:hire|hiring|hires|hired|recruit|employ|employing|staffing|staff up|onboard)\b/, weight: 1 },
  { re: /\b(?:talent|employees?|staff|workers?|workforce|team members|new hires?|headcount)\b/, weight: 1 },
  { re: /\b(?:find|need|looking for|want|get|bring on|take on) (?:\w+ ){0,3}(?:people|someone|somebody|staff|employees|workers|talent|help|hands|team members|a team)\b/, weight: 1 },
];

// A job being posted or filled, not sought.
const POSTING =
  /\b(?:post|posting|advertise|advertising|fill|filling|create|creating|list|listing|open|opened|write|writing) (?:a |an |my |our |the |some |new |more )?(?:\w+ ){0,2}(?:job|jobs|role|roles|position|positions|opening|openings|vacancy|vacancies|ads?|listings?)\b/;

function score(text: string, rules: Rule[], skipJobWords = false): number {
  return rules.reduce((sum, rule) => sum + (rule.jobWords && skipJobWords ? 0 : rule.re.test(text) ? rule.weight : 0), 0);
}

/**
 * Who the visitor is, from what they typed, or null when it isn't clear enough to act on. Looking for work outranks
 * the role words around it (a recruiter looking for a job is a job seeker); between the two kinds of employer, one
 * has to say more than the other, and the words any employer uses (hire, talent, staff) decide nothing on their own.
 */
export function classifyIntent(text: string): Intent | null {
  const normalized = normalizeIntentText(text.slice(0, 500));
  if (!normalized) return null;
  const candidate = score(normalized, CANDIDATE, POSTING.test(normalized));
  const recruiter = score(normalized, RECRUITER);
  const business = score(normalized, SMALL_BUSINESS);
  const employer = score(normalized, EMPLOYER);
  if (candidate > 0 && candidate >= recruiter && candidate >= business && (candidate >= 2 || employer === 0)) return "candidate";
  if (recruiter > 0 && recruiter > business) return "recruiter";
  if (business > 0 && business > recruiter) return "small_business";
  return null;
}
