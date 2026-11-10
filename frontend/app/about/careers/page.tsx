import type { Metadata } from "next";

import { CompanyCareersSection } from "@/components/site/CompanyCareersSection";
import { SitePage } from "@/components/site/SitePage";

export const metadata: Metadata = {
  title: "Careers",
  description: "Working at Hirvello, a beta working on one problem: people who apply, interview and then hear nothing back.",
};

// Working at Hirvello. The job board, the open roles of the companies hiring with Hirvello, is /jobs.
export default function CompanyCareersPage() {
  return (
    <SitePage>
      <CompanyCareersSection />
    </SitePage>
  );
}
