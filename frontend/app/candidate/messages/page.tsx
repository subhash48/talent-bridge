import type { Metadata } from "next";

import { MessagesView } from "@/components/candidate/MessagesView";
import { getMessageThread } from "@/services/portal";

export const metadata: Metadata = { title: "Messages" };

export default async function CandidateMessagesPage() {
  const thread = await getMessageThread().catch(() => undefined);
  return <MessagesView initialThread={thread} />;
}
