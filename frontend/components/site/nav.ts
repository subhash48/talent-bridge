import { Store, UserRound, Users, type LucideIcon } from "lucide-react";

import { DEMO_BOOKING_URL } from "@/lib/booking";

/*
 * The public website's places. The header shows Home, Find Jobs, Product, How it works and Pricing, then Sign in,
 * Book a demo and Create account; the footer spells everything out: the solutions (For you, led by Find jobs), the
 * company, the policies, and where to follow Hirvello. Careers here is working at Hirvello (/about/careers): the job
 * board, the open roles of every company hiring with Hirvello, is /jobs (the old /careers paths redirect there).
 */

export const HOME_LINK = { href: "/", label: "Home" } as const;
/** The public job board: open roles from recruiters and small businesses, no account needed to look. */
export const JOBS_LINK = { href: "/jobs", label: "Find Jobs" } as const;
export const PRODUCT_LINK = { href: "/product", label: "Product" } as const;
export const HOW_IT_WORKS_LINK = { href: "/#how-it-works", label: "How it works" } as const;
export const PRICING_LINK = { href: "/pricing", label: "Pricing" } as const;

/** The solutions: who Hirvello is for, each with its page and a line on what it does for them (the footer's For you). */
export const SOLUTIONS: { href: string; label: string; short: string; text: string; icon: LucideIcon }[] = [
  { href: "/for-recruiters", label: "For Recruiters", short: "Recruiters", text: "Manage hiring and candidate communication.", icon: Users },
  {
    href: "/for-candidates",
    label: "For Candidates",
    short: "Candidates",
    text: "Track applications and prepare for interviews.",
    icon: UserRound,
  },
  {
    href: "/for-small-businesses",
    label: "For Small Businesses",
    short: "Small business",
    text: "Hire easily with an AI assistant.",
    icon: Store,
  },
];

export const COMPANY_LINKS = [
  { href: "/about", label: "About" },
  { href: "/about/careers", label: "Careers" },
  { href: "/contact", label: "Contact" },
] as const;

export const POLICY_LINKS = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
] as const;

/**
 * The two ways into an account from the website. Sign in (existing accounts) asks whether you're a candidate or an
 * employer, then opens that sign-in; Create account (new people) asks how you'll use Hirvello (candidate, recruiter,
 * small business) and makes that account. Both keep the roles and routing the portals already have, and the routes
 * keep their old names (/signin, /start).
 */
export const LOGIN_LINK = { href: "/signin", label: "Sign in" } as const;
export const SIGNUP_LINK = { href: "/start", label: "Create account" } as const;

/**
 * Book a demo: the Google Calendar booking page (lib/booking.ts), in a new tab (NEW_TAB). /book-a-demo redirects there
 * too (next.config.ts), for older links.
 */
export const DEMO_LINK = { href: DEMO_BOOKING_URL, label: "Book a demo" } as const;

/** An outside page in a new tab, without handing it this window (window.opener) or the page's address. */
export const NEW_TAB = { target: "_blank", rel: "noopener noreferrer" } as const;
/** Said to screen readers after a link that opens in a new tab. */
export const NEW_TAB_NOTE = " (opens in a new tab)";
