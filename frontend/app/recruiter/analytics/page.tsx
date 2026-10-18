import type { Metadata } from "next";

import { CommunicationAnalyticsView } from "@/components/recruiter/analytics/CommunicationAnalyticsView";
import { errorMessage } from "@/services/api";
import { getCommunicationAnalytics } from "@/services/communication";

export const metadata: Metadata = { title: "Analytics" };

export default async function AnalyticsPage() {
  const report = await getCommunicationAnalytics(30).then(
    (value) => ({ value, error: undefined }),
    (error: unknown) => ({ value: null, error: errorMessage(error) }),
  );
  return <CommunicationAnalyticsView initial={report.value} error={report.error} />;
}
