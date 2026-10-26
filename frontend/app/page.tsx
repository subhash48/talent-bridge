import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { NightSky } from "@/components/shared/NightSky";
import { AboutSection } from "@/components/site/AboutSection";
import { CandidatesSection } from "@/components/site/CandidatesSection";
import { HowItWorks } from "@/components/site/HowItWorks";
import { RecruitersSection } from "@/components/site/RecruitersSection";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SmallBusinessSection } from "@/components/site/SmallBusinessSection";
import { SiteHeader } from "@/components/site/SiteHeader";
import { buttonStyles } from "@/components/ui/Button";
import { homePath } from "@/lib/auth";
import { getSignedInUser } from "@/lib/session";

export const metadata: Metadata = { title: { absolute: "TalentBridge: never leave a candidate wondering" } };

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
          </div>
        </section>
        <HowItWorks />
        <RecruitersSection />
        <SmallBusinessSection />
        <CandidatesSection />
        <AboutSection />
      </main>
      <SiteFooter />
    </div>
  );
}
