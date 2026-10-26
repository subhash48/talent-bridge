import { Mail } from "lucide-react";

import { ContactForm } from "@/components/site/ContactForm";
import { FeatureIcon, Section } from "@/components/site/Section";
import { CONTACT_TOPICS } from "@/services/contact";

/** Contact TalentBridge. The official address shows only when one is configured: never a made-up one. */
export function ContactSection({ email }: { email: string | null }) {
  return (
    <Section
      id="contact"
      eyebrow="Contact"
      title="Contact TalentBridge"
      intro="Questions about the product, a pilot or design partnership, support or partnerships: send us a message and we'll reply by email."
    >
      <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-[1fr_1.6fr]">
        <div className="flex flex-col gap-6">
          <ul className="flex flex-col gap-2 text-[15px] text-charcoal">
            {CONTACT_TOPICS.map((topic) => (
              <li key={topic.value} className="flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-brand-ink" aria-hidden />
                {topic.label}
              </li>
            ))}
          </ul>
          {email && (
            <p className="flex items-center gap-3 text-[15px] text-charcoal">
              <FeatureIcon>
                <Mail aria-hidden strokeWidth={1.75} />
              </FeatureIcon>
              <span>
                Or email{" "}
                <a href={`mailto:${email}`} className="font-medium text-brand-ink underline-offset-4 hover:underline">
                  {email}
                </a>
              </span>
            </p>
          )}
        </div>
        <div className="glass rounded-[18px] border border-border p-5 sm:p-7">
          <ContactForm />
        </div>
      </div>
    </Section>
  );
}
