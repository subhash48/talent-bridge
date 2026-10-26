import type { Metadata } from "next";

import { HireMessages } from "@/components/hire/HireMessages";
import { getConversations } from "@/services/messages";

export const metadata: Metadata = { title: "Messages" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

// ?applicant= (from Applicants): opens, or starts, that applicant's conversation.
export default async function HireMessagesPage({ searchParams }: Props) {
  const [params, conversations] = await Promise.all([searchParams, getConversations()]);
  return (
    <HireMessages
      initialConversations={conversations}
      initialApplicant={typeof params.applicant === "string" ? params.applicant : null}
    />
  );
}
