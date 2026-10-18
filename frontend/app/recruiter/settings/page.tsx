import { Database, Mail, Sparkles, UserRound } from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { RecruiterHeader } from "@/components/recruiter/RecruiterHeader";
import { CandidateStatusCard } from "@/components/recruiter/settings/CandidateStatusCard";
import { CommunicationRulesCard } from "@/components/recruiter/settings/CommunicationRulesCard";
import { EmailDeliveryCard } from "@/components/recruiter/settings/EmailDeliveryCard";
import { Avatar } from "@/components/shared/Avatar";
import { Card } from "@/components/ui/Card";
import { API_URL, USE_MOCK_API, errorMessage } from "@/services/api";
import { getCommunicationRules, getEmailDelivery } from "@/services/communication";
import { getCurrentUser } from "@/services/me";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const [user, rules, email] = await Promise.all([
    getCurrentUser(),
    getCommunicationRules().then(
      (value) => ({ value, error: undefined }),
      (error: unknown) => ({ value: null, error: errorMessage(error) }),
    ),
    getEmailDelivery().catch(() => null),
  ]);

  return (
    <div className="max-w-3xl">
      <RecruiterHeader title="Settings" subtitle="Your profile, the communication rules, and how messages reach candidates." />
      <div className="flex flex-col gap-4">
        <Card>
          <h2 className="flex items-center gap-2 text-sm font-medium text-stone">
            <UserRound aria-hidden className="size-4" /> Profile
          </h2>
          <div className="mt-4 flex items-center gap-3">
            <Avatar name={user.name} src={user.avatarUrl} size={44} />
            <div>
              <p className="text-base font-semibold text-ink">{user.name}</p>
              <p className="text-sm text-stone">
                {user.title} · {user.organization}
              </p>
            </div>
          </div>
          <dl className="mt-5 grid gap-4 border-t border-border pt-4 text-sm sm:grid-cols-2">
            <Row label="Email" icon={<Mail aria-hidden className="size-4" />}>
              {user.email}
            </Row>
            <Row label="Role">{user.title}</Row>
          </dl>
        </Card>

        <Card>
          <h2 className="flex items-center gap-2 text-sm font-medium text-stone">
            <Database aria-hidden className="size-4" /> Data source
          </h2>
          <p className="mt-3.5 text-sm font-medium text-ink">{USE_MOCK_API ? "Demo data (mock mode)" : "Talent Bridge API"}</p>
          <p className="mt-1.5 text-sm leading-relaxed text-stone">
            {USE_MOCK_API
              ? "Candidates, jobs, interviews and messages come from seeded demo data in this browser. Changes last for this session. Remove NEXT_PUBLIC_USE_MOCK_API to use the API."
              : `Candidates, jobs, interviews and messages are stored in the database behind ${API_URL}.`}
          </p>
        </Card>

        <CommunicationRulesCard initial={rules.value} error={rules.error} />
        <EmailDeliveryCard status={email} />
        <CandidateStatusCard />

        <Card>
          <h2 className="flex items-center gap-2 text-sm font-medium text-stone">
            <Sparkles aria-hidden className="size-4 text-ink" /> AI assistant
          </h2>
          <p className="mt-3.5 text-sm font-medium text-ink">{USE_MOCK_API ? "Template drafts" : "Drafts written on the server"}</p>
          <p className="mt-1.5 text-sm leading-relaxed text-stone">
            The AI drafts candidate updates and answers questions about who needs one. It never evaluates, ranks or
            rejects anyone, and it never sends: you review and approve every message. Model keys stay on the server.
          </p>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, icon, children }: { label: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <dt className="text-stone">{label}</dt>
      <dd className="mt-1 flex items-center gap-2 text-charcoal">
        {icon}
        {children}
      </dd>
    </div>
  );
}
