import { Mail } from "lucide-react";
import Link from "next/link";

import { ContactForm } from "@/components/site/ContactForm";
import { FeatureIcon, Section } from "@/components/site/Section";

/** Contact Kavuntra. The official address shows only when one is configured: never a made-up one. */
export function ContactSection({ email }: { email: string | null }) {
  return (
    <Section
      level="h1"
      id="contact"
      eyebrow="Contact"
      title="Let's talk."
      intro="Questions, feedback, or interested in working with Kavuntra? We'd love to hear from you."
    >
      <div className="mt-14 grid grid-cols-1 gap-12 lg:grid-cols-[1fr_1.6fr]">
        <div className="flex max-w-[26rem] flex-col gap-7 text-[15px] leading-relaxed text-charcoal">
          <p>
            Every message reaches the Kavuntra team, and we reply by email. Tell us what you&apos;re working on, what
            isn&apos;t working, or what you&apos;d like to see.
          </p>
          {email && (
            <p className="flex items-center gap-3">
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
          <p className="text-[14px] text-stone">
            Applying for a role? Jobs at companies hiring with Kavuntra are on the{" "}
            <Link href="/careers" className="font-medium text-brand-ink underline-offset-4 hover:underline">
              job board
            </Link>
            ; working at Kavuntra is under{" "}
            <Link href="/about/careers" className="font-medium text-brand-ink underline-offset-4 hover:underline">
              Careers
            </Link>
            .
          </p>
        </div>
        <div className="sky-card rounded-[24px] p-6 sm:p-8">
          <ContactForm />
        </div>
      </div>
    </Section>
  );
}
