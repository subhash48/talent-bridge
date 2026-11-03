import type { Metadata } from "next";

import { DemoSection } from "@/components/site/DemoSection";
import { SitePage } from "@/components/site/SitePage";
import { getContactEmail } from "@/services/contact";

export const metadata: Metadata = {
  title: "Book a demo",
  description: "Tell us about your team and what you're hiring for, and we'll set up a walkthrough of Hirvello.",
};

// Where the header's Book a demo leads: a request to the team, answered by email (see DemoSection).
export default async function BookADemoPage() {
  const email = await getContactEmail();
  return (
    <SitePage>
      <DemoSection email={email} />
    </SitePage>
  );
}
