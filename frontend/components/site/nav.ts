import { Store, UserRound, Users, type LucideIcon } from "lucide-react";

/*
 * The public website's places. The header shows Product and How it works, the solutions in one menu, Pricing, and
 * the company in another, then Log in and Sign up; the footer spells everything out and adds the policies. Careers
 * here is working at Hirvello: /careers itself is the job board, the open roles of the companies hiring with
 * Hirvello, which keeps its route.
 */

export const PRODUCT_LINK = { href: "/product", label: "Product" } as const;
export const HOW_IT_WORKS_LINK = { href: "/#how-it-works", label: "How it works" } as const;
export const PRICING_LINK = { href: "/pricing", label: "Pricing" } as const;

/** The Solutions menu: who Hirvello is for, each with its page and a line on what it does for them. */
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
 * The two ways into an account from the website. Log in asks whether you're a candidate or an employer, then opens
 * that sign-in; Sign up asks how you'll use Hirvello (candidate, recruiter, small business) and makes that account.
 * Both keep the roles and routing the portals already have.
 */
export const LOGIN_LINK = { href: "/signin", label: "Log in" } as const;
export const SIGNUP_LINK = { href: "/start", label: "Sign up" } as const;
