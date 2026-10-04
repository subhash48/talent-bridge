import type { Metadata } from "next";

import { CandidateMessages } from "@/components/candidate/MessagesView";
import { selectedApplicationId } from "@/lib/selected-application-server";
import { getMessageThread } from "@/services/portal";

export const metadata: Metadata = { title: "Messages" };

export default async function CandidateMessagesPage() {
  const applicationId = await selectedApplicationId();
  const thread = await getMessageThread(applicationId).catch(() => undefined);
  return <CandidateMessages renderedFor={applicationId ?? null} initialThread={thread} />;
}
