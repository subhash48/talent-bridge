import { Database, Mail, Sparkles, UserRound } from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AshbyIntegrationCard } from "@/components/recruiter/AshbyIntegrationCard";
import { RecruiterHeader } from "@/components/recruiter/RecruiterHeader";
import { Avatar } from "@/components/shared/Avatar";
import { Card } from "@/components/ui/Card";
import { API_URL, USE_MOCK_API } from "@/services/api";
import { getCurrentUser } from "@/services/me";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await getCurrentUser();

  return (
    <div className="max-w-3xl">
      <RecruiterHeader title="Settings" subtitle="Your profile and how this workspace connects to its data." />
      <div className="flex flex-col gap-4">
        <Card>
          <h2 className="flex items-center gap-2 text-sm font-medium text-stone">
            <UserRound aria-hidden className="size-4" /> Profile
          </h2>
          <div className="mt-5 flex items-center gap-4">
            <Avatar name={user.name} src={user.avatarUrl} size={56} />
            <div>
              <p className="text-lg font-semibold text-ink">{user.name}</p>
              <p className="text-sm text-stone">
                {user.title} · {user.organization}
              </p>
            </div>
          </div>
          <dl className="mt-6 grid gap-4 border-t border-border pt-5 text-sm sm:grid-cols-2">
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
          <p className="mt-4 text-[15px] text-ink">{USE_MOCK_API ? "Demo data (mock mode)" : "Talent Bridge API"}</p>
          <p className="mt-1.5 text-sm leading-relaxed text-stone">
            {USE_MOCK_API
              ? "Candidates, jobs, interviews and messages come from seeded demo data in this browser. Changes last for this session. Remove NEXT_PUBLIC_USE_MOCK_API to use the API."
              : `Candidates, jobs, interviews and messages are stored in the database behind ${API_URL}.`}
          </p>
        </Card>

        <AshbyIntegrationCard />

        <Card>
          <h2 className="flex items-center gap-2 text-sm font-medium text-stone">
            <Sparkles aria-hidden className="size-4 text-ai" /> AI assistant
          </h2>
          <p className="mt-4 text-[15px] text-ink">{USE_MOCK_API ? "Template responses" : "Recruiter Copilot via the Talent Bridge API"}</p>
          <p className="mt-1.5 text-sm leading-relaxed text-stone">
            The browser never holds model API keys. Answers are generated on the server from the candidate&apos;s record,
            and the assistant only drafts: you review and send every message.
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
