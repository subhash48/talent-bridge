import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Audiences } from "@/components/site/home/Audiences";
import { ClosingCta } from "@/components/site/home/ClosingCta";
import { Hero } from "@/components/site/home/Hero";
import { HowItWorks } from "@/components/site/home/HowItWorks";
import { ProductGlimpse } from "@/components/site/home/ProductGlimpse";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { homePath } from "@/lib/auth";
import { getSignedInUser } from "@/lib/session";

export const metadata: Metadata = { title: { absolute: "Hirvello: talent is everywhere. Find the real ones." } };

// Signed in: straight to your workspace, by the role the API has on record. Signed out: what Hirvello is, from the
// hero down. The longer pages are a click away.
export default async function Home() {
  const user = await getSignedInUser();
  if (user) redirect(homePath(user));

  return (
    <div className="sky-backdrop flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <HowItWorks />
        <Audiences />
        <ProductGlimpse />
        <ClosingCta />
      </main>
      <SiteFooter />
    </div>
  );
}
