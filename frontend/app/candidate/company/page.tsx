import type { Metadata } from "next";

import { CompanyView } from "@/components/candidate/CompanyView";
import { getCandidateCompany } from "@/services/portal";

export const metadata: Metadata = { title: "Company" };

// The company-approved profile. If it can't load here, the view loads it in the browser with a retry.
export default async function CompanyPage() {
  const company = await getCandidateCompany().catch(() => undefined);
  return <CompanyView initialCompany={company} />;
}
