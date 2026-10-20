import type { Metadata } from "next";

import { CompanyView } from "@/components/candidate/CompanyView";
import { selectedApplicationId } from "@/lib/selected-application-server";
import { getCandidateCompany } from "@/services/portal";

export const metadata: Metadata = { title: "Company" };

// The selected application's employer. If it can't load here, the view loads it in the browser with a retry.
export default async function CompanyPage() {
  const company = await getCandidateCompany(await selectedApplicationId()).catch(() => undefined);
  return <CompanyView initialCompany={company} />;
}
