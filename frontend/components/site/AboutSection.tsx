import { Section } from "@/components/site/Section";

/** What Kavuntra is for, without claims about customers, revenue, funding or market position. */
export function AboutSection() {
  return (
    <Section level="h1" id="about" eyebrow="About" title="Hiring should feel better on both sides.">
      <p className="reveal mt-8 max-w-3xl text-[19px] leading-relaxed text-charcoal">
        Kavuntra is building a better connection between hiring teams and candidates. Recruiting systems help
        companies manage hiring internally, but candidates are often left without clear updates or next steps.
        Kavuntra focuses on the communication layer — helping employers stay responsive while giving candidates
        visibility, preparation and a clearer hiring experience.
      </p>
    </Section>
  );
}
