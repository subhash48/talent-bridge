import { Section } from "@/components/site/Section";

/** What TalentBridge is for, without claims about customers, revenue, funding or market position. */
export function AboutSection() {
  return (
    <Section id="about" eyebrow="About" title="Hiring should feel better on both sides.">
      <p className="mt-5 max-w-3xl text-[17px] leading-relaxed text-charcoal">
        TalentBridge is building a better connection between hiring teams and candidates. Recruiting systems help
        companies manage hiring internally, but candidates are often left without clear updates or next steps.
        TalentBridge focuses on the communication layer — helping employers stay responsive while giving candidates
        visibility, preparation and a clearer hiring experience.
      </p>
    </Section>
  );
}
