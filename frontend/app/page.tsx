import { BellRing, Compass, PenLine } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { NightSky } from "@/components/shared/NightSky";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { buttonStyles } from "@/components/ui/Button";
import { homePath } from "@/lib/auth";
import { getSignedInUser } from "@/lib/session";

export const metadata: Metadata = { title: { absolute: "TalentBridge: never leave a candidate wondering" } };

const POINTS = [
  {
    icon: BellRing,
    title: "Catch every communication gap",
    text: "A stage change nobody mentioned, a question with no reply, an interview with no follow-up: TalentBridge flags it the day it's due.",
  },
  {
    icon: PenLine,
    title: "Personal updates in a click",
    text: "AI drafts the update from the candidate's own record. You edit and approve it, and it reaches their portal and their inbox.",
  },
  {
    icon: Compass,
    title: "A clear next step for candidates",
    text: "Candidates always see where they stand, what happens next, whether anything is waiting on them, and how to prepare.",
  },
];

// Signed in: straight to your workspace, by the role the API has on record. Signed out: what TalentBridge is.
export default async function Home() {
  const user = await getSignedInUser();
  if (user) redirect(homePath(user));

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1">
        <section className="relative isolate flex min-h-[calc(100dvh-4rem)] flex-col px-4 sm:px-6">
          <NightSky />
          <div className="mx-auto flex w-full max-w-[1080px] flex-1 flex-col justify-center py-16">
            <h1 className="max-w-3xl text-[40px] leading-[1.05] font-semibold tracking-[-0.03em] text-ink sm:text-[60px]">
              Never leave another candidate wondering what&apos;s happening.
            </h1>
            <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-stone sm:text-lg">
              TalentBridge catches communication gaps, helps recruiters send personalized updates, and gives candidates
              a clear next step and interview preparation throughout the hiring process.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/login?as=employer" className={buttonStyles({ size: "lg" })}>
                Recruiter sign in
              </Link>
              <Link href="/careers" className={buttonStyles({ variant: "secondary", size: "lg" })}>
                See open roles
              </Link>
              <Link href="/login?as=candidate" className={buttonStyles({ variant: "ghost", size: "lg" })}>
                Applied already? Open your portal
              </Link>
            </div>

            <ul className="mt-16 grid grid-cols-1 gap-4 md:grid-cols-3">
              {POINTS.map(({ icon: Icon, title, text }) => (
                <li key={title} className="glass rounded-[14px] border border-border p-5">
                  <span className="flex size-9 items-center justify-center rounded-[10px] bg-brand-soft ring-1 ring-brand-ink/20">
                    <Icon aria-hidden strokeWidth={1.75} className="size-4 text-brand-ink" />
                  </span>
                  <h2 className="mt-4 text-[15px] font-semibold text-ink">{title}</h2>
                  <p className="mt-1.5 text-sm leading-relaxed text-stone">{text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
