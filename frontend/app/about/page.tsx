import type { Metadata } from "next";

import { AboutSection } from "@/components/site/AboutSection";
import { SitePage } from "@/components/site/SitePage";

export const metadata: Metadata = { title: "About" };

export default function AboutPage() {
  return (
    <SitePage>
      <AboutSection />
    </SitePage>
  );
}
