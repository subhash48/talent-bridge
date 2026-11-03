import type { Metadata } from "next";

import { ContactSection } from "@/components/site/ContactSection";
import { SitePage } from "@/components/site/SitePage";
import { getContactEmail } from "@/services/contact";

export const metadata: Metadata = {
  title: "Contact",
  description: "Questions, feedback or a pilot in mind? Write to the Hirvello team and we'll reply by email.",
};

export default async function ContactPage() {
  const email = await getContactEmail();
  return (
    <SitePage>
      <ContactSection email={email} />
    </SitePage>
  );
}
