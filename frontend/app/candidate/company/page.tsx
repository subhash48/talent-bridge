import { EmptyState } from "@/components/shared/EmptyState";
import { CandidateHeader } from "@/components/candidate/CandidateHeader";
import { CandidateSidebar } from "@/components/candidate/CandidateSidebar";

export default function CompanyPage() {
  return (
    <div className="flex min-h-screen">
      <CandidateSidebar />
      <main className="flex-1 px-10 py-10">
        <CandidateHeader title="Company" />
        <EmptyState title="About the company" description="Company, team and values information appears here." />
      </main>
    </div>
  );
}
