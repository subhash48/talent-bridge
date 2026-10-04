import Link from "next/link";
import type { ReactNode } from "react";

import { RoleHeading } from "@/components/careers/RoleHeading";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { buttonStyles } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { CareerJobDetail } from "@/types/careers";

/** A published role in full, with the way to apply: beside it on wide screens, above and below it on phones. */
export function CareerJobView({ job }: { job: CareerJobDetail }) {
  const applyPath = `/demo/careers/${job.id}/apply`;

  return (
    <div className="grid grid-cols-1 gap-6 pt-6 sm:pt-8 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-10">
      <div className="min-w-0">
        <RoleHeading job={job} back={{ href: "/demo/careers", label: "All roles" }} eyebrow={job.department}>
          {job.summary && <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-charcoal">{job.summary}</p>}
          <Link href={applyPath} className={buttonStyles({ size: "lg", className: "mt-6 w-full sm:w-auto lg:hidden" })}>
            Apply for this role
          </Link>
        </RoleHeading>

        <Card className="mt-8 flex flex-col gap-8 p-5 sm:p-7">
          {job.aboutRole && (
            <Section title="About the role">
              <Paragraphs text={job.aboutRole} />
            </Section>
          )}
          {job.responsibilities.length > 0 && (
            <Section title="Responsibilities">
              <Bullets items={job.responsibilities} />
            </Section>
          )}
          {job.requirements.length > 0 && (
            <Section title="Requirements">
              <Bullets items={job.requirements} />
            </Section>
          )}
          {job.preferredQualifications.length > 0 && (
            <Section title="Preferred qualifications">
              <Bullets items={job.preferredQualifications} />
            </Section>
          )}
          {job.skills.length > 0 && (
            <Section title="Skills">
              <ul className="flex flex-wrap gap-2">
                {job.skills.map((skill) => (
                  <li key={skill} className="rounded-full bg-white/[0.05] px-3 py-1 text-[13px] text-charcoal ring-1 ring-white/[0.08]">
                    {skill}
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {job.aboutTeam && (
            <Section title="About the team">
              <Paragraphs text={job.aboutTeam} />
            </Section>
          )}
        </Card>
      </div>

      <aside aria-label="Apply" className="lg:sticky lg:top-8 lg:self-start">
        <Card className="p-5 sm:p-6">
          <Link href={applyPath} className={buttonStyles({ size: "lg", className: "w-full" })}>
            Apply for this role
          </Link>
          <p className="mt-3 text-sm leading-relaxed text-stone">
            It takes a few minutes. Have your résumé ready: PDF, DOC or DOCX, up to 5 MB.
          </p>
          {job.publishedAt && (
            <p className="mt-4 border-t border-border pt-4 text-[13px] text-faint">
              Posted <RelativeTime iso={job.publishedAt} />
            </p>
          )}
        </Card>
      </aside>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold tracking-tight text-ink">{title}</h2>
      <div className="mt-3 text-[15px] leading-relaxed text-charcoal">{children}</div>
    </section>
  );
}

/** Free text from the posting: blank lines separate paragraphs. */
function Paragraphs({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-3">
      {text.split(/\n\s*\n/).map((paragraph, index) => (
        <p key={index} className="whitespace-pre-line">
          {paragraph.trim()}
        </p>
      ))}
    </div>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((item) => (
        <li key={item} className="flex gap-3">
          <span aria-hidden className="mt-[0.6em] size-1 shrink-0 rounded-full bg-ai" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
