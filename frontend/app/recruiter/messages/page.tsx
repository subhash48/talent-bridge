import type { Metadata } from "next";

import { MessagesInbox } from "@/components/recruiter/MessagesInbox";
import { RecruiterHeader } from "@/components/recruiter/RecruiterHeader";
import { getConversations } from "@/services/messages";

export const metadata: Metadata = { title: "Messages" };

type MessagesPageProps = { searchParams: Promise<{ candidate?: string | string[] }> };

export default async function MessagesPage({ searchParams }: MessagesPageProps) {
  const [{ candidate }, conversations] = await Promise.all([searchParams, getConversations()]);

  return (
    <div>
      <RecruiterHeader title="Messages" subtitle={`${conversations.length} conversations with candidates in your pipeline`} />
      <MessagesInbox initialConversations={conversations} initialCandidateId={typeof candidate === "string" ? candidate : undefined} />
    </div>
  );
}
