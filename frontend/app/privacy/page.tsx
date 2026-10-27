import type { Metadata } from "next";
import Link from "next/link";

import { PolicyPage } from "@/components/site/SitePage";

export const metadata: Metadata = { title: "Privacy" };

// A plain-language starting point, written to match how Kavuntra works today. It isn't legal advice and
// isn't final: it's to be reviewed by a lawyer before Kavuntra is offered more widely.
export default function PrivacyPage() {
  return (
    <PolicyPage
      title="Privacy"
      updated="October 2026"
      summary={
        <>
          This is an early draft written in plain language to describe how Kavuntra handles information today. It is
          not legal advice and not a final policy; it will be reviewed before Kavuntra is offered more widely.
          Questions?{" "}
          <Link href="/contact" className="font-medium text-brand-ink underline underline-offset-4">
            Contact us
          </Link>
          .
        </>
      }
    >
      <section>
        <h2>Who this is for</h2>
        <p className="mt-2">
          Kavuntra is used by employers (recruiting teams and small businesses) and by the candidates who apply to
          them. Each employer decides how it hires and is responsible for the hiring decisions it makes. Kavuntra
          provides the tools that keep both sides informed.
        </p>
      </section>
      <section>
        <h2>What we keep</h2>
        <ul>
          <li>
            Account details: your name, email address and sign-in. Passwords are handled by our sign-in provider and are
            never stored by Kavuntra in plain text.
          </li>
          <li>
            Applications: what a candidate gives an employer when applying, such as contact details, a résumé, a
            LinkedIn profile, the days they can work and their experience.
          </li>
          <li>
            Hiring communication: messages between an employer and a candidate, interview details, and a record of what
            was sent and when.
          </li>
          <li>Messages sent with our contact form.</li>
        </ul>
      </section>
      <section>
        <h2>Who sees what</h2>
        <ul>
          <li>
            An employer sees only the applications made to its own jobs, and what the candidate gave with them. It never
            sees a candidate&apos;s applications to other employers.
          </li>
          <li>
            A candidate sees their own applications, the messages the hiring team sends them, their interviews and the
            employer&apos;s public information. They never see a hiring team&apos;s private notes or internal reasons.
          </li>
          <li>
            Applicants&apos; phone numbers are shown only to the employer they applied to, for contacting them about
            that job.
          </li>
        </ul>
      </section>
      <section>
        <h2>How AI is used</h2>
        <p className="mt-2">
          Kavuntra uses AI to draft messages, job descriptions and interview preparation, and to understand typed or
          spoken requests. A person always reviews what is sent. AI is not used to score, rank, reject or decide about
          anyone, and personal characteristics such as race, gender, age, religion, disability or sexual orientation are
          never used to match or sort applicants.
        </p>
      </section>
      <section>
        <h2>Email</h2>
        <p className="mt-2">
          We send emails needed for an account or application, such as confirming an application or a link to create a
          password, and messages an employer chooses to send a candidate.
        </p>
      </section>
      <section>
        <h2>Your choices</h2>
        <p className="mt-2">
          You can ask to see, correct or delete the information Kavuntra holds about you. For an application, you
          can also contact the employer you applied to.
        </p>
      </section>
      <section>
        <h2>Changes</h2>
        <p className="mt-2">This page will change as Kavuntra does. The date at the top says when it last did.</p>
      </section>
    </PolicyPage>
  );
}
