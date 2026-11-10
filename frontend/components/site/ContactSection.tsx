import Link from "next/link";

import { CONTACT_CHANNELS } from "@/components/site/contact";
import { ContactForm } from "@/components/site/ContactForm";
import { Section } from "@/components/site/Section";

/**
 * Contact Hirvello: the two ways in, business inquiries and customer support, each with its own address to email
 * directly, beside one form that reaches the team its topic names.
 */
export function ContactSection() {
  return (
    <Section
      level="h1"
      id="contact"
      eyebrow="Contact"
      title="Write to the Hirvello team."
      intro="Choose what it's about and your message goes straight to the right team. Someone will reply by email."
    >
      <div className="mt-10 grid grid-cols-1 gap-12 lg:grid-cols-[1fr_1.6fr]">
        <div className="flex max-w-[26rem] flex-col gap-7">
          <ul className="border-t border-ink/[0.08]">
            {CONTACT_CHANNELS.map(({ title, text, email }) => (
              <li key={email} className="border-b border-ink/[0.08] py-5">
                <h2 className="text-[18px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
                <p className="mt-1 text-[15px] leading-relaxed text-pretty text-charcoal">{text}</p>
                <a
                  href={`mailto:${email}`}
                  className="mt-2 inline-block rounded-sm text-[15px] font-semibold text-brand-ink underline-offset-4 transition-colors duration-200 hover:text-ink hover:underline"
                >
                  {email}
                </a>
              </li>
            ))}
          </ul>
          <p className="text-[14px] leading-relaxed text-charcoal">
            Applying for a role? Jobs at companies hiring with Hirvello are on the{" "}
            <Link href="/jobs" className="font-medium text-brand-ink underline-offset-4 hover:underline">
              job board
            </Link>
            ; working at Hirvello is under{" "}
            <Link href="/about/careers" className="font-medium text-brand-ink underline-offset-4 hover:underline">
              Careers
            </Link>
            .
          </p>
        </div>
        <div className="sky-card self-start rounded-[20px] p-5 sm:p-7">
          <ContactForm />
        </div>
      </div>
    </Section>
  );
}
