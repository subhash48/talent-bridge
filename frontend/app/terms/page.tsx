import type { Metadata } from "next";
import Link from "next/link";

import { PolicyPage } from "@/components/site/SitePage";

export const metadata: Metadata = { title: "Terms" };

// A plain-language starting point, not legal advice and not final: to be reviewed by a lawyer before
// TalentBridge is offered more widely.
export default function TermsPage() {
  return (
    <PolicyPage
      title="Terms"
      updated="October 2026"
      summary={
        <>
          This is an early draft of TalentBridge&apos;s terms, written in plain language. It is not legal advice and not
          a final agreement; it will be reviewed before TalentBridge is offered more widely. Questions?{" "}
          <Link href="/#contact" className="font-medium text-brand-ink underline underline-offset-4">
            Contact us
          </Link>
          .
        </>
      }
    >
      <section>
        <h2>Using TalentBridge</h2>
        <p className="mt-2">
          TalentBridge helps employers keep candidates informed during hiring, and gives candidates one place to follow
          their applications. You may use it to hire or to apply for work, and for nothing that breaks the law or harms
          others.
        </p>
      </section>
      <section>
        <h2>Accounts</h2>
        <ul>
          <li>Keep your sign-in to yourself, and tell us if you think someone else has used it.</li>
          <li>A candidate account and an employer account are separate: use each for what it&apos;s for.</li>
          <li>An employer&apos;s admin is responsible for who in their company has access to its workspace.</li>
        </ul>
      </section>
      <section>
        <h2>For employers</h2>
        <ul>
          <li>Hire lawfully and fairly. Don&apos;t use TalentBridge to discriminate against anyone.</li>
          <li>Use an applicant&apos;s contact details only to contact them about the job they applied for.</li>
          <li>
            Review what TalentBridge drafts before you send it: you are responsible for what your company sends and
            posts.
          </li>
          <li>Hiring decisions are yours. TalentBridge doesn&apos;t make them.</li>
        </ul>
      </section>
      <section>
        <h2>For candidates</h2>
        <ul>
          <li>Give accurate information when you apply.</li>
          <li>
            An employer decides about its own jobs. TalentBridge shows you what the employer shares, but can&apos;t
            promise an outcome.
          </li>
        </ul>
      </section>
      <section>
        <h2>AI-written content</h2>
        <p className="mt-2">
          Drafts, job descriptions and preparation material written with AI can be wrong or incomplete. They&apos;re a
          starting point for a person to check, not advice.
        </p>
      </section>
      <section>
        <h2>The service</h2>
        <p className="mt-2">
          TalentBridge is an early product and will change. We work to keep it available and your information safe, but
          can&apos;t promise it will always be uninterrupted or free of errors.
        </p>
      </section>
    </PolicyPage>
  );
}
