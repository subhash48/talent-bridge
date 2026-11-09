import type { Metadata } from "next";

import { ContactSection } from "@/components/site/ContactSection";
import { SitePage } from "@/components/site/SitePage";

export const metadata: Metadata = {
  title: "Contact",
  description: "Reach Hirvello's business team or customer support, with the contact form or by email.",
};

export default function ContactPage() {
  return (
    <SitePage>
      <ContactSection />
    </SitePage>
  );
}
