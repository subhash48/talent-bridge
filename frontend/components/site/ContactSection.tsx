import { Mail } from "lucide-react";

import { ContactForm } from "@/components/site/ContactForm";
import { FeatureIcon, Section } from "@/components/site/Section";
import { CONTACT_TOPICS } from "@/services/contact";

/** Contact Kavuntra. The official address shows only when one is configured: never a made-up one. */
export function ContactSection({ email }: { email: string | null }) {
  return (
    <Section
      level="h1"
      id="contact"
      eyebrow="Contact"
      title="Contact Kavuntra"
      intro="Questions about the product, a pilot or design partnership, support or partnerships: send us a message and we'll reply by email."
    >
      <div className="mt-14 grid grid-cols-1 gap-12 lg:grid-cols-[1fr_1.6fr]">
        <div className="flex flex-col gap-7">
          <ul className="flex flex-col gap-2.5 text-[15px] text-charcoal">
            {CONTACT_TOPICS.map((topic) => (
              <li key={topic.value} className="flex items-center gap-2.5">
                <span className="size-1.5 rounded-full bg-accent" aria-hidden />
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
        <div className="sky-card rounded-[24px] p-6 sm:p-8">
          <ContactForm />
        </div>
      </div>
    </Section>
  );
}
