import type { Metadata } from "next";

import { SitePage } from "@/components/site/SitePage";
import { SmallBusinessSection } from "@/components/site/SmallBusinessSection";

export const metadata: Metadata = {
  title: "For small businesses",
  description: "Simple Hire: say who you need, typed or out loud, and Kavuntra prepares the job and the messages for you to approve.",
};

export default function ForSmallBusinessesPage() {
  return (
    <SitePage>
      <SmallBusinessSection />
    </SitePage>
  );
}
