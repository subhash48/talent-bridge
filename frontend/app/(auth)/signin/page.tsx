import { BriefcaseBusiness, ChevronRight, UserRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthCard, authLinkStyles } from "@/components/auth/AuthCard";
import { homePath } from "@/lib/auth";
import { getSignedInUser } from "@/lib/session";

export const metadata: Metadata = { title: "Sign in" };

const CHOICES = [
  {
    href: "/login?as=candidate",
    icon: UserRound,
    title: "Candidate",
    text: "Follow your applications, messages and interviews.",
  },
  {
    href: "/login?as=employer",
    icon: BriefcaseBusiness,
    title: "Employer / Recruiter",
    text: "Open your company's workspace or Simple Hire.",
  },
];

// The website's Sign in: it asks who you are rather than assuming a recruiter.
export default async function SignInChooserPage() {
  const user = await getSignedInUser();
  if (user) redirect(homePath(user));

  return (
    <AuthCard
      title="How are you using TalentBridge?"
      footer={
        <>
          New here?{" "}
          <Link href="/signup" className={authLinkStyles}>
            Create a candidate account
          </Link>{" "}
          or{" "}
          <Link href="/signup/employer" className={authLinkStyles}>
            set up your company
          </Link>
        </>
      }
    >
      <ul className="flex flex-col gap-3">
        {CHOICES.map(({ href, icon: Icon, title, text }) => (
          <li key={href}>
            <Link
              href={href}
              className="group flex items-center gap-4 rounded-[14px] border border-border bg-surface-raised p-4 transition-colors hover:border-border-strong hover:bg-overlay"
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-[12px] bg-brand-soft text-brand-ink ring-1 ring-brand-ink/20">
                <Icon aria-hidden className="size-5" strokeWidth={1.75} />
              </span>
              <span className="flex-1">
                <span className="block text-[15px] font-semibold text-ink">{title}</span>
                <span className="mt-0.5 block text-[13px] leading-snug text-stone">{text}</span>
              </span>
              <ChevronRight
                aria-hidden
                className="size-4 text-faint transition-transform group-hover:translate-x-0.5"
              />
            </Link>
          </li>
        ))}
      </ul>
    </AuthCard>
  );
}
