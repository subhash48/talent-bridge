"use client";

import { Boxes, ExternalLink, Gift, MapPin, Route, UsersRound, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { AskAIEntry } from "@/components/candidate/AskAIEntry";
import { CandidateHeader } from "@/components/candidate/CandidateHeader";
import { LoadError } from "@/components/candidate/LoadError";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { useLiveQuery } from "@/hooks/useLiveQuery";
import { ASK_AI_PROMPTS } from "@/lib/ask-ai";
import { getCandidateCompany } from "@/services/portal";
import type { CandidateCompany } from "@/types/portal";

// The profile changes when the hiring team edits it, not while someone is reading.
const REFRESH_MS = 30 * 60_000;

/** About the company, from the profile it approved (the assistant answers from the same one). */
export function CompanyView({ initialCompany }: { initialCompany?: CandidateCompany }) {
  const { data: company, error, refresh } = useLiveQuery(getCandidateCompany, { initialData: initialCompany, intervalMs: REFRESH_MS });

  if (!company) {
    return (
      <>
        <CandidateHeader title="Company" />
        {error ? (
          <LoadError title="Company information couldn't load" message={error} onRetry={() => void refresh()} />
        ) : (
          <Skeleton className="h-[420px] rounded-[18px]" aria-busy="true" aria-label="Loading company information" />
        )}
      </>
    );
  }

  return (
    <>
      <CandidateHeader title="Company" subtitle={`About ${company.name}`} />
      <div className="flex flex-col gap-5">
        <Card className="p-5 sm:p-7">
          <h2 className="font-semibold tracking-tight text-ink">What {company.name} does</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-charcoal">{company.overview}</p>
          <h3 className="mt-6 text-xs font-medium text-stone">Mission</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-charcoal">{company.mission}</p>
          {company.highlights.length > 0 && (
            <ul className="mt-6 grid grid-cols-1 gap-4 border-t border-border pt-5 sm:grid-cols-3">
              {company.highlights.map((item) => (
                <li key={item.title}>
                  <p className="text-2xl font-semibold tracking-tight text-ink">{item.title}</p>
                  <p className="mt-1 text-[13px] leading-snug text-stone">{item.description}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
          <Section title="Products" icon={Boxes}>
            <ItemList items={company.products} />
          </Section>
          <Section title="Culture" icon={UsersRound} hint="What the team looks for, in its own words">
            <ItemList items={company.values} />
          </Section>
        </div>

        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
          <Section title="Benefits" icon={Gift}>
            <Bullets items={company.benefits} />
            <p className="mt-4 text-xs leading-relaxed text-faint">{company.benefitsNote}</p>
          </Section>
          <div className="flex flex-col gap-5">
            <Section title="Locations" icon={MapPin}>
              <ul className="flex flex-wrap gap-2" aria-label="Offices">
                {company.locations.map((city) => (
                  <li key={city} className="rounded-full bg-white/[0.05] px-3 py-1 text-[13px] text-charcoal ring-1 ring-white/[0.08]">
                    {city}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-sm text-stone">{company.locationsNote}</p>
            </Section>
            <Section title="How hiring works" icon={Route}>
              <ol className="flex flex-col gap-2.5 text-sm text-charcoal">
                {company.hiringProcess.map((step, index) => (
                  <li key={step} className="flex gap-3">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-white/[0.05] text-[11px] text-stone ring-1 ring-white/[0.08]">
                      {index + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
              <p className="mt-4 text-sm text-stone">{company.hiringNote}</p>
            </Section>
          </div>
        </div>

        <Section title="Useful links" icon={ExternalLink}>
          <ul className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {company.links.map((link) => (
              <li key={link.url}>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-charcoal transition-colors hover:text-ink"
                >
                  <ExternalLink aria-hidden className="size-3.5 text-stone" /> {link.label}
                </a>
              </li>
            ))}
          </ul>
        </Section>

        <AskAIEntry
          title={`Questions about ${company.name}?`}
          description="Ask AI about the company, the role, the culture or benefits."
          prompts={ASK_AI_PROMPTS.slice(1, 3)}
        />
        <p className="text-xs text-faint">{company.source}</p>
      </div>
    </>
  );
}

function Section({ title, icon: Icon, hint, children }: { title: string; icon: LucideIcon; hint?: string; children: ReactNode }) {
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="flex items-center gap-2.5 font-semibold tracking-tight text-ink">
        <span className="flex size-8 items-center justify-center rounded-full bg-white/[0.05] ring-1 ring-white/[0.08]">
          <Icon aria-hidden className="size-4 text-charcoal" />
        </span>
        {title}
      </h2>
      {hint && <p className="mt-2 text-xs text-faint">{hint}</p>}
      <div className="mt-4">{children}</div>
    </Card>
  );
}

function ItemList({ items }: { items: { title: string; description: string }[] }) {
  return (
    <ul className="flex flex-col gap-4">
      {items.map((item) => (
        <li key={item.title}>
          <p className="text-sm font-medium text-ink">{item.title}</p>
          <p className="mt-1 text-sm leading-relaxed text-charcoal">{item.description}</p>
        </li>
      ))}
    </ul>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-col gap-2.5 text-sm leading-relaxed text-charcoal">
      {items.map((item) => (
        <li key={item} className="flex gap-2.5">
          <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-ai" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
