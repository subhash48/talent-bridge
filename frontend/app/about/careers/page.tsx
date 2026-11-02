import type { Metadata } from "next";

import { CompanyCareersSection } from "@/components/site/CompanyCareersSection";
import { SitePage } from "@/components/site/SitePage";

export const metadata: Metadata = {
  title: "Careers",
  description: "Working at Hirvello: the tools that make hiring clearer, simpler and more human.",
};

// Working at Hirvello. The job board, the open roles of the companies hiring with Hirvello, stays at /careers.
export default function CompanyCareersPage() {
  return (
    <SitePage>
      <CompanyCareersSection />
    </SitePage>
  );
}
