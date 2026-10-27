import type { Metadata } from "next";

import { ContactSection } from "@/components/site/ContactSection";
import { SitePage } from "@/components/site/SitePage";
import { getContactEmail } from "@/services/contact";

export const metadata: Metadata = { title: "Contact" };

export default async function ContactPage() {
  const email = await getContactEmail();
  return (
    <SitePage>
      <ContactSection email={email} />
    </SitePage>
  );
}
