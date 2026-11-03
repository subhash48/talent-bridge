import type { Metadata } from "next";

import { AboutSection } from "@/components/site/AboutSection";
import { SitePage } from "@/components/site/SitePage";

export const metadata: Metadata = {
  title: "About",
  description: "Why Hirvello exists: people apply, interview and then hear nothing back. Hirvello shows recruiters who is waiting and tells candidates what happens next.",
};

export default function AboutPage() {
  return (
    <SitePage>
      <AboutSection />
    </SitePage>
  );
}
