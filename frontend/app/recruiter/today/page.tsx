import type { Metadata } from "next";

import { TodayView } from "@/components/recruiter/today/TodayView";
import { errorMessage } from "@/services/api";
import { getAttention } from "@/services/communication";

export const metadata: Metadata = { title: "Today" };

// The recruiter's home: who needs an update, with a draft ready to review and send.
export default async function TodayPage() {
  const [attention] = await Promise.allSettled([getAttention()]);
  return (
    <TodayView
      initial={attention.status === "fulfilled" ? attention.value : null}
      error={attention.status === "rejected" ? errorMessage(attention.reason) : undefined}
    />
  );
}
